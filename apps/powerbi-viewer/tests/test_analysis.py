"""analysis.py のテスト。ブラウザ（Pyodide）と同じコードを CPython + pandas で検証する。

実行: python3 -m unittest discover -s apps/powerbi-viewer/tests -v
必要なパッケージ: apps/powerbi-viewer/requirements-dev.txt
"""

import io
import json
import sys
import unittest
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import analysis  # noqa: E402


def call(method, **args):
    res = json.loads(analysis.api(method, json.dumps(args, ensure_ascii=False)))
    assert res["ok"], f"{method} が失敗した: {res.get('error')}。直し方: analysis.py の {method} を確認する"
    return res["data"]


def load(data: bytes, name: str, sheet=None):
    return json.loads(analysis.api_load(data, name, sheet))


def xlsx(rows: list[list]) -> bytes:
    buf = io.BytesIO()
    pd.DataFrame(rows).to_excel(buf, header=False, index=False, engine="openpyxl")
    return buf.getvalue()


def kinds(meta) -> dict:
    return {c["name"]: c["kind"] for c in meta["columns"]}


POWERBI_CSV = "地域,製品,売上,注文日\n関東,A,\"1,200\",2025/01/05\n関西,B,800,2025/02/10\n関東,B,500,2025/02/11\n"


class ReadTest(unittest.TestCase):
    def test_utf8_bom_csv_from_power_bi(self):
        res = load(("﻿" + POWERBI_CSV).encode("utf-8"), "export.csv")
        self.assertTrue(res["ok"], f"BOM 付き UTF-8 の CSV を読めない: {res.get('error')}。直し方: decode_text を確認する")
        meta = res["data"]
        self.assertEqual(meta["rows"], 3, "行数が違う。直し方: clean_frame の見出し行判定を確認する")
        self.assertEqual(
            kinds(meta),
            {"地域": "category", "製品": "category", "売上": "number", "注文日": "datetime"},
            "列の型推定が想定と違う。BOM が列名に残っていないか、桁区切り・日付の判定を確認する。直し方: infer_kind",
        )
        self.assertEqual(meta["info"]["encoding"], "UTF-8")

    def test_shift_jis_csv(self):
        res = load(POWERBI_CSV.encode("cp932"), "手作業.csv")
        self.assertTrue(res["ok"], f"Shift_JIS の CSV を読めない: {res.get('error')}。直し方: decode_text に cp932 を残す")
        self.assertEqual(res["data"]["info"]["encoding"], "Shift_JIS (CP932)")
        self.assertIn("地域", kinds(res["data"]), "Shift_JIS の列名が文字化けしている。直し方: decode_text の判定順を確認する")

    def test_tab_delimited(self):
        res = load(POWERBI_CSV.replace(",", "\t").replace('"1\t200"', "1200").encode(), "x.txt")
        self.assertTrue(res["ok"], res.get("error"))
        self.assertEqual(res["data"]["info"]["delimiter"], "タブ", "タブ区切りを判定できない。直し方: sniff_delimiter")

    def test_xlsx_with_applied_filters_row_and_truncation_footer(self):
        data = xlsx(
            [
                ["Applied filters:\nCity isn't Atlanta, GA", None, None],
                ["City", "Discount", "Date"],
                ["Tokyo", 0.1, pd.Timestamp("2025-01-01")],
                ["Osaka", 0.2, pd.Timestamp("2025-02-01")],
                ["Exported data exceeded the allowed volume. Some data might have been omitted.", None, None],
            ]
        )
        res = load(data, "export.xlsx")
        self.assertTrue(res["ok"], f"Power BI 形式の xlsx を読めない: {res.get('error')}。直し方: read_table / clean_frame")
        meta = res["data"]
        self.assertEqual(meta["rows"], 2, "注記行がデータ行に混ざっている。直し方: clean_frame の注記行の除去を確認する")
        self.assertEqual(kinds(meta), {"City": "category", "Discount": "number", "Date": "datetime"})
        self.assertTrue(meta["info"]["truncated"], "上限超過の注記を検出できない。直し方: TRUNCATED の正規表現")
        self.assertTrue(meta["info"]["notes"][0].startswith("Applied filters"), "適用フィルターの注記が info.notes にない")

    def test_xlsx_sheet_selection(self):
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            pd.DataFrame({"a": [1]}).to_excel(w, sheet_name="小さい", index=False)
            pd.DataFrame({"b": range(10), "c": range(10)}).to_excel(w, sheet_name="Export", index=False)
        meta = load(buf.getvalue(), "multi.xlsx")["data"]
        self.assertEqual(meta["info"]["sheet"], "Export", "データが最も多いシートを選んでいない。直し方: pick_sheet")
        self.assertEqual(meta["info"]["sheets"], ["小さい", "Export"])
        other = load(buf.getvalue(), "multi.xlsx", "小さい")["data"]
        self.assertEqual(other["info"]["sheet"], "小さい", "指定したシートに切り替わらない。直し方: read_table の sheet 引数")

    def test_number_formats(self):
        csv = "金額,率,損益\n\"¥1,000\",12%,(300)\n２，５００円,3.5%,400\n"
        res = load(csv.encode(), "n.csv")["data"]
        rows = call("preview")["rows"]
        self.assertEqual(kinds(res)["金額"], "number")
        self.assertEqual([r[0] for r in rows], [1000, 2500], "通貨記号・全角数字・桁区切りを数値にできない。直し方: to_number")
        self.assertAlmostEqual(rows[0][1], 0.12, msg="% を小数にしていない。直し方: to_number")
        self.assertEqual(rows[0][2], -300, "括弧の負数を負にしていない。直し方: to_number")

    def test_japanese_dates_and_plain_years(self):
        csv = "日付,年,値\n2025年1月5日,2024,1\n2025年2月1日,2025,2\n"
        meta = load(csv.encode(), "d.csv")["data"]
        self.assertEqual(kinds(meta)["日付"], "datetime", "「2025年1月5日」を日付にできない。直し方: JP_DATE")
        self.assertEqual(kinds(meta)["年"], "number", "年の数値を日付と誤認している。直し方: to_datetime の区切り判定")
        self.assertIn("年", meta["dimensions"], "一意値の少ない数値列を軸に使えない。直し方: Dataset.dimensions")

    def test_duplicate_and_blank_headers(self):
        meta = load("a,a,,b\n1,2,3,4\n".encode(), "h.csv")["data"]
        self.assertEqual([c["name"] for c in meta["columns"]], ["a", "a (2)", "列3", "b"], "重複・空の列名を整理できない")

    def test_errors_are_user_facing(self):
        res = load(b"x", "file.pdf")
        self.assertFalse(res["ok"])
        self.assertIn("直し方", res["error"], "エラーに直し方がない。直し方: UserError のメッセージに追記する")
        res = load(b"not a zip", "broken.xlsx")
        self.assertFalse(res["ok"])
        self.assertIn("直し方", res["error"])


class LimitTest(unittest.TestCase):
    """悪意のある・壊れたファイルでブラウザのメモリを使い切らないこと。"""

    def test_zip_bomb_is_rejected_before_parsing(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            with zf.open("xl/worksheets/sheet1.xml", "w") as f:
                chunk = b"\0" * (1024 * 1024)
                for _ in range(64):
                    f.write(chunk)
        res = load(buf.getvalue(), "bomb.xlsx")
        self.assertFalse(res["ok"], "圧縮率の極端な zip を展開しようとしている。直し方: analysis.check_zip")
        self.assertIn("展開後のサイズが大きすぎる", res["error"])

    def test_non_zip_xlsx_is_rejected(self):
        res = load(b"PK\x03\x04 broken", "broken.xlsx")
        self.assertFalse(res["ok"])
        self.assertIn("直し方", res["error"])

    def test_too_many_periods_is_rejected(self):
        csv = "日付,値\n1900-01-01,1\n2099-12-31,2\n"
        load(csv.encode(), "range.csv")
        res = json.loads(analysis.api("timeseries", json.dumps({"date_column": "日付", "measure": "値", "freq": "D"})))
        self.assertFalse(res["ok"], "日単位で 7 万区間を作ろうとしている。直し方: timeseries の MAX_PERIODS")
        self.assertIn("直し方", res["error"])
        self.assertTrue(call("timeseries", date_column="日付", measure="値", freq="Y")["periods"], "年単位なら表示できるべき")

    def test_malformed_filters_are_user_errors(self):
        call("load_sample")
        for filters in ({"地域": "関東"}, {"売上": {"type": "range", "min": "abc"}}, {"地域": {"type": "in", "values": ["x"] * 10_001}}):
            res = json.loads(analysis.api("set_filters", json.dumps({"filters": filters}, ensure_ascii=False)))
            self.assertFalse(res["ok"], f"不正なフィルター {str(filters)[:40]} を受け付けている")
            self.assertNotIn("処理中にエラー", res["error"], "想定外の例外になっている。直し方: Dataset.set_filters で UserError にする")

    def test_requested_sizes_are_clamped(self):
        call("load_sample")
        self.assertLessEqual(len(call("group", dimension="地域", measure=None, top=10**9)["rows"]), analysis.MAX_TOP)
        self.assertLessEqual(len(call("preview", size=10**9)["rows"]), 500)
        self.assertLessEqual(len(call("histogram", column="売上", bins=10**9)["bins"]), 200)


class AnalysisTest(unittest.TestCase):
    def setUp(self):
        self.meta = call("load_sample")

    def test_sample_is_deterministic(self):
        self.assertEqual(self.meta["rows"], 1460)
        first = call("preview", size=1)["rows"][0]
        call("load_sample")
        self.assertEqual(call("preview", size=1)["rows"][0], first, "サンプルが毎回変わる。直し方: sample_frame の乱数の種")

    def test_group_sum_and_other(self):
        g = call("group", dimension="担当者", measure="売上", agg="sum", top=3)
        self.assertEqual(len(g["rows"]), 3)
        values = [r["value"] for r in g["rows"]]
        self.assertEqual(values, sorted(values, reverse=True), "降順に並んでいない。直し方: group の sort_values")
        self.assertIsNotNone(g["other"], "上位以外を「その他」にまとめていない")
        self.assertAlmostEqual(sum(values) + g["other"]["value"], g["total"], msg="合計が一致しない")

    def test_group_count_without_measure(self):
        g = call("group", dimension="地域", measure=None)
        self.assertEqual(g["total"], 1460, "件数の合計が行数と一致しない。直し方: aggregate_series の件数処理")

    def test_timeseries_split_caps_series(self):
        ts = call("timeseries", date_column="注文日", measure="売上", freq="M", split="担当者", max_series=3)
        names = [s["name"] for s in ts["series"]]
        self.assertEqual(len(names), 4, "上位3系列＋その他になっていない。直し方: timeseries の max_series")
        self.assertEqual(names[-1], "その他")
        self.assertEqual(ts["periods"][0], "2024-10")
        self.assertTrue(all(len(s["values"]) == len(ts["periods"]) for s in ts["series"]), "期間と値の数が違う")
        total = sum(sum(s["values"]) for s in ts["series"])
        self.assertAlmostEqual(total, next(k["value"] for k in call("summary")["kpis"] if k.get("column") == "売上"), delta=1, msg="系列合計が全体合計と一致しない")

    def test_filters_apply_everywhere(self):
        call("set_filters", filters={"地域": {"type": "in", "values": ["関東"]}, "注文日": {"type": "range", "min": "2025-01-01", "max": "2025-12-31"}})
        summary = call("summary")
        self.assertLess(summary["filtered_rows"], summary["rows"])
        g = call("group", dimension="地域", measure=None)
        self.assertEqual([r["label"] for r in g["rows"]], ["関東"], "フィルターが集計に反映されていない")
        p = call("preview", size=500)
        dates = sorted(r[0] for r in p["rows"])
        self.assertTrue(dates[0] >= "2025-01-01" and dates[-1] <= "2025-12-31", "日付範囲（終了日を含む）が効いていない")
        call("set_filters", filters={})
        self.assertEqual(call("summary")["filtered_rows"], 1460, "フィルター解除が効かない")

    def test_numeric_range_filter(self):
        call("set_filters", filters={"売上": {"type": "range", "min": 100000, "max": ""}})
        stats = call("histogram", column="売上")["stats"]
        self.assertGreaterEqual(stats["min"], 100000, "数値の下限フィルターが効いていない")

    def test_histogram_counts_match(self):
        h = call("histogram", column="利益")
        self.assertEqual(sum(b["count"] for b in h["bins"]), h["stats"]["count"], "階級の合計が件数と一致しない")
        self.assertLessEqual(len(h["bins"]), 40, "自動の階級数が多すぎる")

    def test_correlation_matrix(self):
        c = call("correlation")
        self.assertEqual(c["columns"], ["数量", "売上", "利益"])
        self.assertEqual(c["matrix"][0][0], 1)
        self.assertGreater(c["matrix"][1][2], 0.8, "売上と利益の相関が低すぎる（サンプル生成を変えた？）")

    def test_pivot_shape(self):
        p = call("pivot", row="地域", column="製品カテゴリ", measure="売上")
        self.assertEqual(len(p["matrix"]), len(p["rows"]))
        self.assertTrue(all(len(r) == len(p["columns"]) for r in p["matrix"]), "クロス集計の行列の形が崩れている")

    def test_preview_search_sort_paging(self):
        p = call("preview", search="担当A", sort="売上", desc=True, size=10, page=0)
        self.assertTrue(all(r[3] == "担当A" for r in p["rows"]), "検索が効いていない")
        sales = [r[5] for r in p["rows"]]
        self.assertEqual(sales, sorted(sales, reverse=True), "並べ替えが効いていない")
        self.assertEqual(p["pages"], -(-p["matched"] // 10))
        last = call("preview", page=10_000, size=10)
        self.assertEqual(last["page"], last["pages"] - 1, "範囲外のページ指定を丸めていない")

    def test_insights_are_factual(self):
        items = call("insights")["items"]
        kinds_ = [i["kind"] for i in items]
        self.assertIn("share", kinds_)
        self.assertIn("corr", kinds_)
        self.assertIn("因果を示しません", next(i["text"] for i in items if i["kind"] == "corr"))

    def test_api_rejects_unknown_and_bad_columns(self):
        res = json.loads(analysis.api("eval", "{}"))
        self.assertFalse(res["ok"], "未知の操作を受け付けている。直し方: api の METHODS 照合")
        res = json.loads(analysis.api("group", json.dumps({"dimension": "存在しない列", "measure": None})))
        self.assertFalse(res["ok"])
        self.assertIn("直し方", res["error"])

    def test_output_is_strict_json(self):
        load("a,b\nx,\ny,1\n".encode(), "nan.csv")
        for method in ("summary", "profile", "preview", "insights", "correlation"):
            raw = analysis.api(method, "{}")
            self.assertNotIn("NaN", raw, f"{method} の出力に NaN が混じり、JS の JSON.parse が失敗する。直し方: num()")
            self.assertTrue(json.loads(raw)["ok"], raw)


if __name__ == "__main__":
    unittest.main()
