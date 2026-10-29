"""Power BI データビューアの解析エンジン。

ブラウザ内の Pyodide で実行する。JavaScript からは `api(method, args_json)` だけを呼び、
戻り値はすべて JSON 文字列にする（Python オブジェクトを JS 側に持ち出さない）。
ローカルの CPython + pandas でも同じように動くので、テストは tests/test_analysis.py で行う。
"""

from __future__ import annotations

import io
import json
import math
import re
import unicodedata
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

# 型推定で「この列は数値（日付）」とみなす、変換に成功した値の割合
PARSE_RATIO = 0.95
# カテゴリ列とみなす一意値の上限
CATEGORY_MAX_UNIQUE = 200
# 数値列でも、一意値がこの数以下なら集計の軸に使える（例: 年、月番号）
NUMERIC_DIMENSION_MAX_UNIQUE = 30
OTHER_LABEL = "その他"
BLANK_LABEL = "(空白)"
COUNT_KEY = "__count__"
AGGS = {"sum", "mean", "median", "min", "max", "count", "nunique"}
FREQS = {"D": "日", "W": "週", "M": "月", "Q": "四半期", "Y": "年"}

# Power BI の Excel エクスポートは 1 行目に「Applied filters: …」、上限を超えると末尾に
# 「Exported data exceeded the allowed volume. …」を書き込む（Microsoft Learn「Export data from a Power BI visualization」）
NOTE_ROW = re.compile(r"applied filters|適用され|フィルター|exceeded|omitted|超え|省略", re.I)
TRUNCATED = re.compile(r"exceeded|omitted|超え|省略", re.I)
CURRENCY = re.compile(r"[,\s¥￥$€£円]")
JP_DATE = re.compile(r"(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})?\s*日?")


class UserError(Exception):
    """利用者に見せてよい、原因と直し方を含むエラー。"""


# --------------------------------------------------------------------------- 読み込み


def decode_text(data: bytes) -> tuple[str, str]:
    """CSV のバイト列を文字列にする。Power BI は BOM 付き UTF-8、手作業の CSV は Shift_JIS が多い。"""
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        return data.decode("utf-16"), "UTF-16"
    for encoding, label in (("utf-8-sig", "UTF-8"), ("cp932", "Shift_JIS (CP932)")):
        try:
            return data.decode(encoding), label
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace"), "UTF-8（一部の文字を置換）"


def sniff_delimiter(text: str) -> str:
    head = "\n".join(text.splitlines()[:20])
    counts = {d: head.count(d) for d in (",", "\t", ";", "|")}
    best = max(counts, key=lambda d: counts[d])
    return best if counts[best] > 0 else ","


def read_table(data: bytes, filename: str, sheet: str | None = None) -> tuple[pd.DataFrame, dict]:
    name = filename.lower()
    info: dict[str, Any] = {"sheets": [], "sheet": None, "encoding": None, "delimiter": None}
    if name.endswith((".xlsx", ".xlsm", ".xls", ".xlsb", ".ods")):
        try:
            book = pd.ExcelFile(io.BytesIO(data), engine="calamine")
        except Exception as exc:  # noqa: BLE001 - 壊れたファイルの種類は多い
            raise UserError(
                f"Excel ファイルを開けませんでした（{type(exc).__name__}）。"
                "直し方: Power BI から .xlsx で再エクスポートするか、Excel で開いて保存し直してください。"
            ) from exc
        sheets = [str(s) for s in book.sheet_names]
        target = sheet if sheet in sheets else pick_sheet(book, sheets)
        df = book.parse(target, header=None)
        info.update(sheets=sheets, sheet=target)
    elif name.endswith((".csv", ".tsv", ".txt")):
        text, encoding = decode_text(data)
        delimiter = "\t" if name.endswith(".tsv") else sniff_delimiter(text)
        try:
            df = pd.read_csv(
                io.StringIO(text),
                sep=delimiter,
                header=None,
                dtype=str,
                keep_default_na=False,
                skip_blank_lines=True,
                on_bad_lines="warn",
            )
        except Exception as exc:  # noqa: BLE001
            raise UserError(
                f"CSV を読み取れませんでした（{exc}）。直し方: 区切り文字がカンマかタブか確認してください。"
            ) from exc
        info.update(encoding=encoding, delimiter={",": "カンマ", "\t": "タブ", ";": "セミコロン", "|": "パイプ"}[delimiter])
    else:
        raise UserError("対応していない形式です。直し方: .csv / .xlsx / .xls ファイルを選んでください。")
    df, notes = clean_frame(df)
    info["notes"] = notes
    info["truncated"] = any(TRUNCATED.search(n) for n in notes)
    return df, info


def pick_sheet(book: pd.ExcelFile, sheets: list[str]) -> str:
    """データが最も多いシートを選ぶ。Power BI のエクスポートは通常 1 シート。"""
    best, best_size = sheets[0], -1
    for s in sheets[:20]:
        size = book.parse(s, header=None, nrows=2000).count().sum()
        if size > best_size:
            best, best_size = s, size
    return best


def clean_frame(raw: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """見出し行の前後にある注記行（値が1つだけの行）を取り除き、見出し行から列名を作る。"""
    raw = raw.replace(r"^\s*$", np.nan, regex=True)
    raw = raw.dropna(axis=0, how="all").dropna(axis=1, how="all")
    notes: list[str] = []
    if raw.empty:
        raise UserError("データ行が見つかりませんでした。直し方: 1行目が列名、2行目以降がデータの表を選んでください。")
    wide = raw.shape[1] > 1
    start = 0
    while wide and start < len(raw) - 1 and raw.iloc[start].notna().sum() <= 1:
        notes.append(str(raw.iloc[start].dropna().iloc[0]).strip())
        start += 1
    header = raw.iloc[start]
    body = raw.iloc[start + 1 :]
    while wide and len(body) and body.iloc[-1].notna().sum() == 1:
        value = body.iloc[-1].dropna().iloc[0]
        if not (isinstance(value, str) and NOTE_ROW.search(value)):
            break
        notes.insert(len(notes), value.strip())
        body = body.iloc[:-1]
    df = body.copy()
    df.columns = unique_names([clean_header(c, i) for i, c in enumerate(header)])
    df = df.infer_objects()
    if df.empty:
        raise UserError("見出し行の下にデータがありません。直し方: エクスポートしたファイルにデータ行があるか確認してください。")
    return df.reset_index(drop=True), notes


def clean_header(value: Any, index: int) -> str:
    if isinstance(value, float) and not math.isnan(value) and value.is_integer():
        value = int(value)
    text = "" if value is None or (isinstance(value, float) and math.isnan(value)) else str(value).strip()
    if not text or text.startswith("Unnamed:"):
        return f"列{index + 1}"
    return text


def unique_names(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for n in names:
        if n in seen:
            seen[n] += 1
            out.append(f"{n} ({seen[n]})")
        else:
            seen[n] = 1
            out.append(n)
    return out


# --------------------------------------------------------------------------- 型推定


def to_number(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    text = series.astype("string").map(lambda v: unicodedata.normalize("NFKC", v) if isinstance(v, str) else v)
    text = text.str.replace(CURRENCY, "", regex=True).str.replace("−", "-", regex=False)
    negative = text.str.match(r"^\(.*\)$", na=False)
    text = text.str.strip("()")
    percent = text.str.endswith("%", na=False)
    num = pd.to_numeric(text.str.rstrip("%"), errors="coerce")
    num = num.where(~percent, num / 100)
    return num.where(~negative, -num)


def to_datetime(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    text = series.astype("string").str.strip()
    text = text.str.replace(JP_DATE, lambda m: f"{m[1]}-{m[2]}-{m[3] or 1}", regex=True)
    # 区切りのない数値（例: 2024, 12345）を日付と誤認しない
    if not text.str.contains(r"[-/.:T]", na=False).any():
        return pd.Series(pd.NaT, index=series.index)
    return pd.to_datetime(text, errors="coerce", format="mixed")


def infer_kind(series: pd.Series) -> tuple[str, pd.Series]:
    present = series.dropna()
    if present.empty:
        return "text", series
    if pd.api.types.is_bool_dtype(series):
        return "category", series.map({True: "TRUE", False: "FALSE"})
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime", series
    num = to_number(series)
    if num.notna().sum() >= PARSE_RATIO * len(present):
        return "number", num
    if present.map(lambda v: isinstance(v, (datetime, date, pd.Timestamp))).all():
        return "datetime", pd.to_datetime(series, errors="coerce")
    dt = to_datetime(series)
    if dt.notna().sum() >= PARSE_RATIO * len(present):
        return "datetime", dt
    text = series.map(lambda v: v if v is None or (isinstance(v, float) and math.isnan(v)) else str(v).strip())
    unique = text.nunique(dropna=True)
    if unique <= CATEGORY_MAX_UNIQUE or unique <= 0.5 * len(present):
        return "category", text
    return "text", text


# --------------------------------------------------------------------------- セッション


class Dataset:
    def __init__(self, df: pd.DataFrame, name: str, info: dict):
        self.name = name
        self.info = info
        self.kinds: dict[str, str] = {}
        cols = {}
        for col in df.columns:
            kind, values = infer_kind(df[col])
            self.kinds[col] = kind
            cols[col] = values
        self.df = pd.DataFrame(cols)
        self.filters: dict[str, dict] = {}

    # ---- 列の分類
    def columns(self, *kinds: str) -> list[str]:
        return [c for c, k in self.kinds.items() if k in kinds]

    def dimensions(self) -> list[str]:
        dims = self.columns("category", "text")
        dims += [c for c in self.columns("number") if self.df[c].nunique() <= NUMERIC_DIMENSION_MAX_UNIQUE]
        return dims

    def require(self, col: str | None, *kinds: str) -> str:
        if col not in self.kinds:
            raise UserError(f"列「{col}」が見つかりません。直し方: 一覧から列を選び直してください。")
        if kinds and self.kinds[col] not in kinds and not (col in self.dimensions() and "category" in kinds):
            raise UserError(f"列「{col}」はこの集計に使えない型（{self.kinds[col]}）です。")
        return col

    # ---- フィルター
    def view(self) -> pd.DataFrame:
        df = self.df
        mask = pd.Series(True, index=df.index)
        for col, f in self.filters.items():
            s = df[col]
            if f["type"] == "in":
                labels = label_series(s)
                mask &= labels.isin(set(f["values"]))
            elif f["type"] == "range":
                lo, hi = f.get("min"), f.get("max")
                if self.kinds[col] == "datetime":
                    lo = pd.Timestamp(lo) if lo else None
                    hi = pd.Timestamp(hi) + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1) if hi else None
                if lo is not None:
                    mask &= s >= lo
                if hi is not None:
                    mask &= s <= hi
        return df[mask]

    def set_filters(self, filters: dict) -> None:
        clean = {}
        for col, f in filters.items():
            self.require(col)
            if f.get("type") == "in" and isinstance(f.get("values"), list):
                clean[col] = {"type": "in", "values": [str(v) for v in f["values"]]}
            elif f.get("type") == "range":
                lo, hi = f.get("min"), f.get("max")
                if self.kinds[col] == "number":
                    lo = float(lo) if lo not in (None, "") else None
                    hi = float(hi) if hi not in (None, "") else None
                if lo is not None or hi is not None:
                    clean[col] = {"type": "range", "min": lo, "max": hi}
        self.filters = clean


def label_series(s: pd.Series) -> pd.Series:
    """集計の軸に使う表示ラベル。欠損は「(空白)」、整数値は小数点なしにする。"""

    def fmt(v: Any) -> str:
        if v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NA or v is pd.NaT:
            return BLANK_LABEL
        if isinstance(v, (float, np.floating)) and float(v).is_integer():
            return str(int(v))
        if isinstance(v, pd.Timestamp):
            return v.strftime("%Y-%m-%d")
        return str(v)

    return s.map(fmt).astype(object)


def aggregate_series(values: pd.Series | None, groups: list, agg: str, index: pd.Index) -> pd.Series:
    if agg not in AGGS:
        raise UserError(f"集計方法「{agg}」には対応していません。")
    if values is None:  # 件数
        return pd.Series(1, index=index).groupby(groups, sort=False).sum()
    grouped = values.groupby(groups, sort=False)
    return getattr(grouped, agg)()


_dataset: Dataset | None = None


def current() -> Dataset:
    if _dataset is None:
        raise UserError("データがまだ読み込まれていません。直し方: ファイルを選択してください。")
    return _dataset


# --------------------------------------------------------------------------- API


def load(data: bytes, filename: str, sheet: str | None = None) -> dict:
    global _dataset
    df, info = read_table(data, filename, sheet)
    _dataset = Dataset(df, filename, info)
    return summary()


def load_sample(rows: int = 1460) -> dict:
    global _dataset
    _dataset = Dataset(sample_frame(rows), "サンプル売上データ（架空）.csv", {"sheets": [], "sheet": None, "encoding": "生成データ", "delimiter": None, "notes": [], "truncated": False})
    return summary()


def sample_frame(rows: int) -> pd.DataFrame:
    """デモ用の架空データ。乱数の種を固定し、毎回同じ内容にする。"""
    rng = np.random.default_rng(20261029)
    dates = pd.Timestamp("2024-10-01") + pd.to_timedelta(rng.integers(0, 730, rows), unit="D")
    regions = rng.choice(["関東", "関西", "中部", "九州", "北海道", "東北"], rows, p=[0.34, 0.22, 0.16, 0.12, 0.08, 0.08])
    categories = rng.choice(["ノートPC", "モニター", "周辺機器", "ソフトウェア", "保守サービス"], rows)
    base = {"ノートPC": 180000, "モニター": 42000, "周辺機器": 9000, "ソフトウェア": 26000, "保守サービス": 60000}
    qty = rng.integers(1, 12, rows)
    season = 1 + 0.18 * np.sin((dates.month.to_numpy() - 3) / 12 * 2 * np.pi)
    trend = 1 + (dates - dates.min()).days.to_numpy() / 730 * 0.25
    unit = np.array([base[c] for c in categories]) * rng.normal(1, 0.08, rows)
    sales = (unit * qty * season * trend).round(-1)
    margin = np.clip(rng.normal(0.22, 0.07, rows), 0.02, 0.5)
    df = pd.DataFrame(
        {
            "注文日": dates.strftime("%Y-%m-%d"),
            "地域": regions,
            "製品カテゴリ": categories,
            "担当者": rng.choice([f"担当{c}" for c in "ABCDEFGH"], rows),
            "数量": qty,
            "売上": sales,
            "利益": (sales * margin).round(-1),
        }
    ).sort_values("注文日", kind="stable")
    return df.reset_index(drop=True)


def summary() -> dict:
    ds = current()
    view = ds.view()
    numbers = ds.columns("number")
    measures = [c for c in numbers if c not in ds.dimensions() or ds.df[c].nunique() > 12]
    kpis = [{"label": "行数", "value": int(len(view)), "total": int(len(ds.df)), "format": "int"}]
    for col in measures[:3]:
        kpis.append({"label": f"{col} 合計", "value": num(view[col].sum()), "format": "number", "column": col})
    return {
        "name": ds.name,
        "rows": int(len(ds.df)),
        "filtered_rows": int(len(view)),
        "columns": [{"name": c, "kind": k} for c, k in ds.kinds.items()],
        "dimensions": ds.dimensions(),
        "measures": numbers,
        "datetimes": ds.columns("datetime"),
        "info": ds.info,
        "filters": ds.filters,
        "kpis": kpis,
    }


def profile() -> dict:
    ds = current()
    view = ds.view()
    out = []
    for col, kind in ds.kinds.items():
        s = view[col]
        item: dict[str, Any] = {
            "name": col,
            "kind": kind,
            "count": int(s.notna().sum()),
            "missing": int(s.isna().sum()),
            "unique": int(s.nunique(dropna=True)),
        }
        if kind == "number":
            item.update(min=num(s.min()), max=num(s.max()), mean=num(s.mean()), median=num(s.median()), sum=num(s.sum()))
        elif kind == "datetime":
            item.update(min=iso(s.min()), max=iso(s.max()))
        else:
            top = label_series(s.dropna()).value_counts().head(3)
            item["top"] = [{"value": str(k), "count": int(v)} for k, v in top.items()]
        out.append(item)
    return {"columns": out, "rows": int(len(view))}


def filter_options(column: str, search: str = "", limit: int = 300) -> dict:
    ds = current()
    col = ds.require(column)
    kind = ds.kinds[col]
    s = ds.df[col]
    if kind == "number" and col not in ds.dimensions():
        return {"kind": "range", "min": num(s.min()), "max": num(s.max())}
    if kind == "datetime":
        return {"kind": "date", "min": iso(s.min(), date_only=True), "max": iso(s.max(), date_only=True)}
    counts = label_series(s).value_counts()
    if search:
        counts = counts[counts.index.str.contains(re.escape(search), case=False)]
    return {
        "kind": "in",
        "values": [{"value": str(k), "count": int(v)} for k, v in counts.head(limit).items()],
        "total": int(len(counts)),
    }


def set_filters(filters: dict) -> dict:
    current().set_filters(filters)
    return summary()


def group(dimension: str, measure: str | None, agg: str = "sum", top: int = 15, fold_other: bool = True) -> dict:
    ds = current()
    view = ds.view()
    dim = ds.require(dimension, "category")
    values = None if measure in (None, "", COUNT_KEY) else view[ds.require(measure, "number")]
    if values is None:
        agg = "count"
    labels = label_series(view[dim])
    result = aggregate_series(values, [labels], agg if values is not None else "sum", view.index)
    result = result.dropna().sort_values(ascending=False, kind="stable")
    total = num(result.sum()) if agg in ("sum", "count") else None
    rows = [{"label": str(k), "value": num(v)} for k, v in result.head(top).items()]
    rest = result.iloc[top:]
    other = None
    if fold_other and len(rest) and agg in ("sum", "count"):
        other = {"label": f"{OTHER_LABEL}（{len(rest)}件）", "value": num(rest.sum())}
    return {"rows": rows, "other": other, "groups": int(len(result)), "total": total, "agg": agg}


def timeseries(
    date_column: str, measure: str | None, agg: str = "sum", freq: str = "M", split: str | None = None, max_series: int = 5
) -> dict:
    ds = current()
    view = ds.view()
    dcol = ds.require(date_column, "datetime")
    if freq not in FREQS:
        raise UserError(f"集計単位「{freq}」には対応していません。")
    values = None if measure in (None, "", COUNT_KEY) else view[ds.require(measure, "number")]
    if values is None:
        agg = "count"
    dates = view[dcol]
    valid = dates.notna()
    periods = dates[valid].dt.to_period(freq)
    view_valid = view[valid]
    vals = values[valid] if values is not None else None
    if periods.empty:
        return {"periods": [], "series": [], "freq": freq}
    full = pd.period_range(periods.min(), periods.max(), freq=freq)
    groups_key = [periods]
    names = [None]
    if split:
        scol = ds.require(split, "category")
        labels = label_series(view_valid[scol])
        ranking = aggregate_series(vals, [labels], "sum" if agg in ("sum", "count") else agg, view_valid.index)
        keep = list(ranking.sort_values(ascending=False).index[:max_series])
        labels = labels.where(labels.isin(keep), OTHER_LABEL)
        names = keep + ([OTHER_LABEL] if (labels == OTHER_LABEL).any() and OTHER_LABEL not in keep else [])
        groups_key = [periods, labels]
    result = aggregate_series(vals, groups_key, agg if vals is not None else "sum", view_valid.index)
    fill = 0 if agg in ("sum", "count") else None
    series = []
    for name in names:
        part = result if name is None else result.xs(name, level=1) if name in result.index.get_level_values(1) else pd.Series(dtype=float)
        part = part.reindex(full)
        series.append({"name": name or (measure if values is not None else "件数"), "values": [num(v) if not pd.isna(v) else fill for v in part]})
    return {"periods": [period_label(p, freq) for p in full], "series": series, "freq": freq, "agg": agg}


def period_label(p: pd.Period, freq: str) -> str:
    if freq == "Y":
        return f"{p.year}"
    if freq == "Q":
        return f"{p.year} Q{p.quarter}"
    if freq == "M":
        return p.strftime("%Y-%m")
    return p.start_time.strftime("%Y-%m-%d")


def histogram(column: str, bins: int = 0) -> dict:
    ds = current()
    s = ds.view()[ds.require(column, "number")].dropna()
    if s.empty:
        return {"bins": [], "stats": {}}
    arr = s.to_numpy(dtype=float)
    if bins <= 0:
        edges = np.histogram_bin_edges(arr, bins="auto")
        if len(edges) > 41:
            edges = np.histogram_bin_edges(arr, bins=40)
    else:
        edges = np.histogram_bin_edges(arr, bins=min(int(bins), 200))
    counts, edges = np.histogram(arr, bins=edges)
    q = np.quantile(arr, [0.25, 0.5, 0.75])
    return {
        "bins": [{"from": num(edges[i]), "to": num(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)],
        "stats": {
            "count": int(arr.size),
            "mean": num(arr.mean()),
            "std": num(arr.std(ddof=1)) if arr.size > 1 else None,
            "min": num(arr.min()),
            "q1": num(q[0]),
            "median": num(q[1]),
            "q3": num(q[2]),
            "max": num(arr.max()),
        },
    }


def correlation(limit: int = 15) -> dict:
    ds = current()
    view = ds.view()
    cols = [c for c in ds.columns("number") if view[c].nunique() > 1][:limit]
    if len(cols) < 2:
        return {"columns": cols, "matrix": []}
    corr = view[cols].corr(method="pearson", min_periods=3)
    return {"columns": cols, "matrix": [[num(v) for v in row] for row in corr.to_numpy()]}


def pivot(row: str, column: str, measure: str | None, agg: str = "sum", max_rows: int = 30, max_cols: int = 12) -> dict:
    ds = current()
    view = ds.view()
    r = ds.require(row, "category")
    c = ds.require(column, "category")
    values = None if measure in (None, "", COUNT_KEY) else view[ds.require(measure, "number")]
    if values is None:
        agg = "count"
    rl, cl = label_series(view[r]), label_series(view[c])
    top_r = rl.value_counts().index[:max_rows]
    top_c = cl.value_counts().index[:max_cols]
    rl = rl.where(rl.isin(top_r), OTHER_LABEL)
    cl = cl.where(cl.isin(top_c), OTHER_LABEL)
    result = aggregate_series(values, [rl, cl], agg if values is not None else "sum", view.index)
    table = result.unstack(fill_value=np.nan)
    order_r = [x for x in list(top_r) + [OTHER_LABEL] if x in table.index]
    order_c = [x for x in list(top_c) + [OTHER_LABEL] if x in table.columns]
    table = table.reindex(index=order_r, columns=order_c)
    return {
        "rows": [str(x) for x in table.index],
        "columns": [str(x) for x in table.columns],
        "matrix": [[num(v) for v in row] for row in table.to_numpy()],
        "agg": agg,
    }


def preview(page: int = 0, size: int = 50, search: str = "", sort: str | None = None, desc: bool = False) -> dict:
    ds = current()
    view = ds.view()
    if search:
        needle = search.lower()
        hit = pd.Series(False, index=view.index)
        for col in view.columns:
            hit |= label_series(view[col]).str.lower().str.contains(needle, regex=False)
        view = view[hit]
    if sort in view.columns:
        view = view.sort_values(sort, ascending=not desc, na_position="last", kind="stable")
    size = max(1, min(int(size), 500))
    pages = max(1, math.ceil(len(view) / size))
    page = max(0, min(int(page), pages - 1))
    chunk = view.iloc[page * size : (page + 1) * size]
    return {
        "columns": [{"name": c, "kind": ds.kinds[c]} for c in view.columns],
        "rows": [[cell(v, ds.kinds[c]) for c, v in zip(view.columns, row)] for row in chunk.itertuples(index=False)],
        "page": page,
        "pages": pages,
        "matched": int(len(view)),
    }


def export_rows() -> dict:
    """フィルター後の全行。CSV への書き出しは JS 側で行う。"""
    ds = current()
    view = ds.view()
    return {
        "columns": list(view.columns),
        "rows": [[cell(v, ds.kinds[c]) for c, v in zip(view.columns, row)] for row in view.itertuples(index=False)],
    }


def insights() -> dict:
    """集計結果から機械的に読み取れる事実だけを文章にする（推測は書かない）。"""
    ds = current()
    view = ds.view()
    notes: list[dict] = []
    measures = ds.columns("number")
    measure = next((m for m in measures if m not in ds.dimensions()), measures[0] if measures else None)
    dims = [d for d in ds.dimensions() if d not in measures and 1 < view[d].nunique() <= CATEGORY_MAX_UNIQUE]
    if measure and dims:
        g = group(dims[0], measure, "sum", top=1)
        if g["rows"] and g["total"]:
            top = g["rows"][0]
            share = top["value"] / g["total"] * 100 if g["total"] else 0
            notes.append({"kind": "share", "text": f"「{dims[0]}」別の{measure}合計は「{top['label']}」が最大で、全体の {share:.1f}% を占めます。"})
    dts = ds.columns("datetime")
    if dts:
        ts = timeseries(dts[0], measure, "sum" if measure else "count", "M")
        vals = ts["series"][0]["values"] if ts["series"] else []
        if len(vals) >= 2 and vals[-2]:
            change = (vals[-1] - vals[-2]) / abs(vals[-2]) * 100
            label = measure or "件数"
            notes.append(
                {
                    "kind": "trend",
                    "text": f"直近の月（{ts['periods'][-1]}）の{label}は前月比 {change:+.1f}% です。"
                    + ("月の途中までのデータの可能性があります。" if change < -50 else ""),
                }
            )
        if len(vals) >= 3:
            peak = int(np.nanargmax(np.array(vals, dtype=float)))
            notes.append({"kind": "peak", "text": f"月別の{measure or '件数'}が最も大きいのは {ts['periods'][peak]} です。"})
    corr = correlation()
    if corr["matrix"]:
        best = None
        cols = corr["columns"]
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                v = corr["matrix"][i][j]
                if v is not None and (best is None or abs(v) > abs(best[2])):
                    best = (cols[i], cols[j], v)
        if best and abs(best[2]) >= 0.5:
            sign = "正" if best[2] > 0 else "負"
            notes.append({"kind": "corr", "text": f"「{best[0]}」と「{best[1]}」に{sign}の相関があります（r = {best[2]:.2f}）。相関は因果を示しません。"})
    missing = [(c, int(view[c].isna().sum())) for c in view.columns]
    missing = [(c, n) for c, n in missing if n]
    if missing and len(view):
        c, n = max(missing, key=lambda x: x[1])
        notes.append({"kind": "missing", "text": f"「{c}」に空白が {n:,} 件（{n / len(view) * 100:.1f}%）あります。集計では除外されます。"})
    return {"items": notes}


# --------------------------------------------------------------------------- 変換


def num(v: Any) -> float | int | None:
    if v is None or v is pd.NA:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 2**53 else f


def iso(v: Any, date_only: bool = False) -> str | None:
    if v is None or v is pd.NaT or (isinstance(v, float) and math.isnan(v)):
        return None
    ts = pd.Timestamp(v)
    if date_only or (ts.hour == ts.minute == ts.second == 0):
        return ts.strftime("%Y-%m-%d")
    return ts.strftime("%Y-%m-%d %H:%M")


def cell(v: Any, kind: str) -> Any:
    if kind == "number":
        return num(v)
    if kind == "datetime":
        return iso(v)
    if v is None or v is pd.NA or (isinstance(v, float) and math.isnan(v)):
        return None
    return str(v)


METHODS = {
    "summary": summary,
    "profile": profile,
    "filter_options": filter_options,
    "set_filters": set_filters,
    "group": group,
    "timeseries": timeseries,
    "histogram": histogram,
    "correlation": correlation,
    "pivot": pivot,
    "preview": preview,
    "export_rows": export_rows,
    "insights": insights,
    "load_sample": load_sample,
}


def api(method: str, args_json: str = "{}") -> str:
    """JS からの唯一の入口。結果は {"ok": true, "data": …} か {"ok": false, "error": …}。"""
    try:
        if method not in METHODS:
            raise UserError(f"未知の操作です: {method}")
        data = METHODS[method](**json.loads(args_json or "{}"))
        return json.dumps({"ok": True, "data": data}, ensure_ascii=False, allow_nan=False)
    except UserError as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001 - 想定外の失敗も画面に出す
        return json.dumps({"ok": False, "error": f"処理中にエラーが発生しました（{type(exc).__name__}: {exc}）"}, ensure_ascii=False)


def api_load(data: bytes, filename: str, sheet: str | None = None) -> str:
    """ファイルのバイト列だけは JSON を通さずに受け取る。"""
    try:
        raw = data.to_bytes() if hasattr(data, "to_bytes") else bytes(data)  # Pyodide では JS の Uint8Array が届く
        return json.dumps({"ok": True, "data": load(raw, filename, sheet)}, ensure_ascii=False, allow_nan=False)
    except UserError as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"ok": False, "error": f"読み込み中にエラーが発生しました（{type(exc).__name__}: {exc}）"}, ensure_ascii=False)
