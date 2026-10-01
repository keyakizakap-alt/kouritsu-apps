import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import type { Note, Settings } from '../domain/types';
import { type NoteRow, noteToParams, parseSettings, rowToNote } from './rows';

/**
 * すべてのデータは端末内の SQLCipher 暗号化 DB に保存する（通信・クラウド同期なし）。
 * 暗号鍵は初回起動時に端末内で生成し、iOS Keychain / Android Keystore（expo-secure-store）
 * にのみ保管する。THIS_DEVICE_ONLY のため、鍵がバックアップ経由で他端末へ移ることはない。
 */
const DB_NAME = 'sticky-memo.db';
const KEY_NAME = 'sticky-memo.db-key.v1';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getOrCreateKey(): Promise<string> {
  const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  const existing = await SecureStore.getItemAsync(KEY_NAME, options);
  if (existing) return existing;
  const bytes = Crypto.getRandomBytes(32);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, hex, options);
  return hex;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        items TEXT NOT NULL DEFAULT '[]',
        color TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        widget_slot INTEGER,
        reminder_at INTEGER,
        notification_id TEXT,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const key = await getOrCreateKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // 鍵は 16 進文字のみで構成されるため、文字列連結でも SQL として安全
  await db.execAsync(`PRAGMA key = '${key}'`);
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db);
  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function loadNotes(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes');
  return rows.map(rowToNote);
}

export async function saveNotes(notes: Note[]): Promise<void> {
  if (notes.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const note of notes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO notes
          (id, kind, title, body, items, color, pinned, locked, widget_slot, reminder_at,
           notification_id, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        noteToParams(note),
      );
    }
  });
}

export async function deleteNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('DELETE FROM notes WHERE id = ?', id);
    }
  });
}

export async function getKV(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setKV(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
}

export async function loadSettings(): Promise<Settings> {
  return parseSettings(await getKV('settings'));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setKV('settings', JSON.stringify(settings));
}
