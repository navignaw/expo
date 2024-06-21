import { Asset } from 'expo-asset';
import * as FS from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import path from 'path';

export const name = 'SQLite';

// The version here needs to be the same as both the podspec and build.gradle for expo-sqlite
const VERSION = '3.42.0';

interface UserEntity {
  name: string;
  k: number;
  j: number;
}

export function test({ describe, expect, it, beforeAll, beforeEach, afterEach, ...t }) {
  describe('Basic tests', () => {
    it('should be able to drop + create a table, insert, query', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
`);
      const statement = await db.prepareAsync('INSERT INTO users (name, k, j) VALUES (?, ?, ?)');
      await statement.executeAsync('Tim Duncan', 1, 23.4);
      await statement.executeAsync(['Manu Ginobili', 5, 72.8]);
      await statement.executeAsync(['Nikhilesh Sigatapu', 7, 42.14]);

      const results = await db.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(results.length).toBe(3);
      expect(results[0].j).toBeCloseTo(23.4);
      await statement.finalizeAsync();
      await db.closeAsync();
    });

    it(`should use specified SQLite version: ${VERSION}`, async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      const row = await db.getFirstAsync<{ 'sqlite_version()': string }>('SELECT sqlite_version()');
      expect(row['sqlite_version()']).toEqual(VERSION);
      await db.closeAsync();
    });

    it('unixepoch() is supported', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      const row = await db.getFirstAsync<{ 'unixepoch()': number }>('SELECT unixepoch()');
      expect(row['unixepoch()']).toBeTruthy();
      await db.closeAsync();
    });

    it('should support bigger integers than int32_t', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      const value = 1700007974511;
      const row = await db.getFirstAsync<{ value: number }>(`SELECT ${value} as value`);
      expect(row['value']).toBe(value);
      const row2 = await db.getFirstAsync<{ value: number }>('SELECT $value as value', {
        $value: value,
      });
      expect(row2['value']).toBe(value);
      await db.closeAsync();
    });

    it('should support PRAGMA statements', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS test;
CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      const results = await db.getAllAsync<any>('PRAGMA table_info(test)');
      expect(results.length).toBe(2);
      expect(results[0].name).toBe('id');
      expect(results[1].name).toBe('name');

      // a no-result pragma
      await db.runAsync('PRAGMA case_sensitive_like = true');

      // a setter/getter pragma
      await db.runAsync('PRAGMA user_version = 123');
      const info = await db.getFirstAsync<any>('PRAGMA user_version');
      expect(info.user_version).toBe(123);

      await db.closeAsync();
    });

    it('should support utf-8', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(
        'CREATE TABLE translations (id INTEGER PRIMARY KEY NOT NULL, key TEXT, value TEXT);'
      );
      const statement = await db.prepareAsync(
        'INSERT INTO translations (key, value) VALUES (?, ?)'
      );
      await statement.executeAsync('hello', '哈囉');
      await statement.finalizeAsync();

      const result = await db.getFirstAsync<any>('SELECT * FROM translations');
      expect(result.key).toBe('hello');
      expect(result.value).toBe('哈囉');
    });

    it('using getAllAsync for write operations should only run once', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS test;
CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      let error = null;
      try {
        await db.getAllAsync('INSERT INTO test (id, name) VALUES (?, ?)', 0, 'aaa');
      } catch (e) {
        error = e;
      }
      // If running twice, the second insertion will fail because of the primary key constraint
      expect(error).toBeNull();
    });
  });

  describe('File system tests', () => {
    beforeAll(async () => {
      if (!(await FS.getInfoAsync(FS.documentDirectory + 'SQLite')).exists) {
        await FS.makeDirectoryAsync(FS.documentDirectory + 'SQLite');
      }
    });

    it('should work with a downloaded .db file', async () => {
      await FS.downloadAsync(
        Asset.fromModule(require('../assets/asset-db.db')).uri,
        `${FS.documentDirectory}SQLite/downloaded.db`
      );

      const db = await SQLite.openDatabaseAsync('downloaded.db');
      const results = await db.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(results.length).toEqual(3);
      expect(results[0].j).toBeCloseTo(23.4);
      await db.closeAsync();
    }, 30000);

    it('should create and delete a database in file system', async () => {
      const db = await SQLite.openDatabaseAsync('test.db');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
`);
      await db.closeAsync();

      let fileInfo = await FS.getInfoAsync(`${FS.documentDirectory}SQLite/test.db`);
      expect(fileInfo.exists).toBeTruthy();

      await SQLite.deleteDatabaseAsync('test.db');
      fileInfo = await FS.getInfoAsync(`${FS.documentDirectory}SQLite/test.db`);
      expect(fileInfo.exists).toBeFalsy();
    });

    it('should be able to recreate db from scratch by deleting file', async () => {
      let db = await SQLite.openDatabaseAsync('test.db');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
INSERT INTO users (name, k, j) VALUES ('Tim Duncan', 1, 23.4);
`);
      let results = await db.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(results.length).toBe(1);
      await db.closeAsync();

      let fileInfo = await FS.getInfoAsync(`${FS.documentDirectory}SQLite/test.db`);
      expect(fileInfo.exists).toBeTruthy();
      await FS.deleteAsync(`${FS.documentDirectory}SQLite/test.db`);
      fileInfo = await FS.getInfoAsync(`${FS.documentDirectory}SQLite/test.db`);
      expect(fileInfo.exists).toBeFalsy();

      db = await SQLite.openDatabaseAsync('test.db');
      await db.execAsync(`
      DROP TABLE IF EXISTS users;
      CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
      `);
      results = await db.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(results.length).toBe(0);
      await db.runAsync('INSERT INTO users (name, k, j) VALUES (?, ?, ?)', 'Tim Duncan', 1, 23.4);
      results = await db.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(results.length).toBe(1);

      await db.closeAsync();
    });
  });

  describe('Statements', () => {
    it('should maintain correct type of potentialy null bind parameters', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS nulling;
CREATE TABLE IF NOT EXISTS nulling (id INTEGER PRIMARY KEY NOT NULL, x NUMERIC, y NUMERIC);
`);
      await db.runAsync('INSERT INTO nulling (x, y) VALUES (?, ?)', [null, null]);
      const statement = await db.prepareAsync('INSERT INTO nulling (x, y) VALUES (?, ?)');
      statement.executeAsync(null, null);
      statement.finalizeAsync();

      const results = await db.getAllAsync<{ x: number | null; y: number | null }>(
        'SELECT * FROM nulling'
      );
      expect(results[0].x).toBeNull();
      expect(results[0].y).toBeNull();
      expect(results[1].x).toBeNull();
      expect(results[1].y).toBeNull();

      await db.closeAsync();
    });

    it('should support the `RETURNING` clause', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS customers;
CREATE TABLE customers (id PRIMARY KEY NOT NULL, name VARCHAR(255),email VARCHAR(255));
`);

      let statement = await db.prepareAsync(
        'INSERT INTO customers (id, name, email) VALUES (?, ?, ?) RETURNING name, email'
      );
      let result = await (
        await statement.executeAsync<any>(1, 'John Doe', 'john@example.com')
      ).getFirstAsync();
      await statement.finalizeAsync();
      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John Doe');

      statement = await db.prepareAsync(
        'UPDATE customers SET name=$name, email=$email WHERE id=$id RETURNING name, email'
      );
      result = await (
        await statement.executeAsync<any>({
          $id: 1,
          $name: 'Jane Doe',
          $email: 'jane@example.com',
        })
      ).getFirstAsync();
      await statement.finalizeAsync();
      expect(result.email).toBe('jane@example.com');
      expect(result.name).toBe('Jane Doe');

      statement = await db.prepareAsync('DELETE from customers WHERE id=? RETURNING name, email');
      result = await (await statement.executeAsync<any>(1)).getFirstAsync();
      await statement.finalizeAsync();
      expect(result.email).toBe('jane@example.com');
      expect(result.name).toBe('Jane Doe');
    });

    it('runAsync should return changes in RunResult', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      await db.runAsync('INSERT INTO users (name) VALUES (?), (?), (?)', [
        'name1',
        'name2',
        'name3',
      ]);
      let statement = await db.prepareAsync('DELETE FROM users WHERE name=?');
      let result = await statement.executeAsync('name1');
      expect(result.changes).toBe(1);
      await statement.finalizeAsync();

      statement = await db.prepareAsync('DELETE FROM users WHERE name=? OR name=?');
      result = await statement.executeAsync(['name2', 'name3']);
      expect(result.changes).toBe(2);
      await statement.finalizeAsync();

      // ensure deletion succeedeed
      expect((await db.getAllAsync('SELECT * FROM users')).length).toBe(0);

      await db.closeAsync();
    });

    it('should return correct rowsAffected value when deleting cascade', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.runAsync('PRAGMA foreign_keys = ON');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS posts;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
CREATE TABLE IF NOT EXISTS posts (post_id INTEGER PRIMARY KEY NOT NULL, content VARCHAR(64), userposted INTEGER, FOREIGN KEY(userposted) REFERENCES users(user_id) ON DELETE CASCADE);
`);

      await db.runAsync('INSERT INTO users (name) VALUES (?), (?), (?)', [
        'name1',
        'name2',
        'name3',
      ]);
      await db.runAsync('INSERT INTO posts (content, userposted) VALUES (?, ?), (?, ?), (?, ?)', [
        'post1',
        1,
        'post2',
        1,
        'post3',
        2,
      ]);

      let statement = await db.prepareAsync('DELETE FROM users WHERE name=?');
      let result = await statement.executeAsync('name1');
      expect(result.changes).toBe(1);
      await statement.finalizeAsync();

      statement = await db.prepareAsync('DELETE FROM users WHERE name=? OR name=?');
      result = await statement.executeAsync(['name2', 'name3']);
      expect(result.changes).toBe(2);
      await statement.finalizeAsync();

      // ensure deletion succeedeed
      expect((await db.getAllAsync('SELECT * FROM users')).length).toBe(0);
      expect((await db.getAllAsync('SELECT * FROM posts')).length).toBe(0);

      await db.runAsync('PRAGMA foreign_keys = OFF');
      await db.closeAsync();
    });

    it('should throw when accessing a finalized statement', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      const statement = await db.prepareAsync('INSERT INTO users (user_id, name) VALUES (?, ?)');
      await statement.finalizeAsync();
      let error = null;
      try {
        await statement.executeAsync(null, null);
      } catch (e) {
        error = e;
      }
      expect(error.toString()).toMatch(/Access to closed resource/);
    });

    it('should throw from getFirstAsync()/getAllAsync() if the cursor is not at the beginning', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
INSERT INTO users (user_id, name, k, j) VALUES (1, 'Tim Duncan', 1, 23.4);
INSERT INTO users (user_id, name, k, j) VALUES (2, 'Manu Ginobili', 5, 72.8);
INSERT INTO users (user_id, name, k, j) VALUES (3, 'Nikhilesh Sigatapu', 7, 42.14);
`);

      for (const method of ['getFirstAsync', 'getAllAsync']) {
        const statement = await db.prepareAsync('SELECT * FROM users ORDER BY j ASC');
        let error = null;
        try {
          const result = await statement.executeAsync<UserEntity>();
          await result.next();
          await result[method]();
        } catch (e) {
          error = e;
        } finally {
          await statement.finalizeAsync();
        }
        expect(error.toString()).toMatch(/The SQLite cursor has been shifted/);

        const statement2 = await db.prepareAsync('SELECT * FROM users ORDER BY j ASC');
        error = null;
        try {
          const result2 = await statement2.executeAsync<UserEntity>();
          await result2.next();
          await result2.resetAsync();
          await result2[method]();
        } catch (e) {
          error = e;
        } finally {
          await statement2.finalizeAsync();
        }
        expect(error).toBeNull();
      }
    });
  });

  describe('Statement parameters bindings', () => {
    let db: SQLite.SQLiteDatabase;

    beforeEach(async () => {
      db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
INSERT INTO users (user_id, name, k, j) VALUES (1, 'Tim Duncan', 1, 23.4);
INSERT INTO users (user_id, name, k, j) VALUES (2, 'Manu Ginobili', 5, 72.8);
INSERT INTO users (user_id, name, k, j) VALUES (3, 'Nikhilesh Sigatapu', 7, 42.14);
`);
    });
    afterEach(async () => {
      await db.closeAsync();
    });

    it('should support async iterator', async () => {
      const results: UserEntity[] = [];
      const statement = await db.prepareAsync('SELECT * FROM users ORDER BY user_id DESC');
      const result = await statement.executeAsync<UserEntity>();
      for await (const row of result) {
        results.push(row);
      }
      await statement.finalizeAsync();
      expect(results.length).toBe(3);
      expect(results[0].name).toBe('Nikhilesh Sigatapu');
      expect(results[1].name).toBe('Manu Ginobili');
      expect(results[2].name).toBe('Tim Duncan');
    });

    it('should support variadic unnamed parameter binding', async () => {
      const statement = await db.prepareAsync('SELECT * FROM users WHERE name = ? AND k = ?');
      let result = await (
        await statement.executeAsync<UserEntity>('Tim Duncan', 1)
      ).getFirstAsync();
      expect(result).not.toBeNull();
      result = await (await statement.executeAsync<UserEntity>('Tim Duncan', -1)).getFirstAsync();
      expect(result).toBeNull();
      await statement.finalizeAsync();
    });

    it('should support array unnamed parameter binding', async () => {
      const statement = await db.prepareAsync('SELECT * FROM users WHERE name = ? AND k = ?');
      let result = await (
        await statement.executeAsync<UserEntity>(['Tim Duncan', 1])
      ).getFirstAsync();
      expect(result).not.toBeNull();

      result = await (await statement.executeAsync<UserEntity>(['Tim Duncan', -1])).getFirstAsync();
      expect(result).toBeNull();
      await statement.finalizeAsync();
    });

    it('should support array named parameter binding - $VVV', async () => {
      const statement = await db.prepareAsync('SELECT * FROM users WHERE name = $name AND k = $k');
      let result = await (
        await statement.executeAsync<UserEntity>({ $name: 'Tim Duncan', $k: 1 })
      ).getFirstAsync();
      expect(result).not.toBeNull();
      result = await (
        await statement.executeAsync<UserEntity>({ $name: 'Tim Duncan', $k: -1 })
      ).getFirstAsync();
      expect(result).toBeNull();
      await statement.finalizeAsync();
    });

    it('should support array named parameter binding - :VVV', async () => {
      const statement = await db.prepareAsync('SELECT * FROM users WHERE name = :name AND k = :k');
      let result = await (
        await statement.executeAsync<UserEntity>({ ':name': 'Tim Duncan', ':k': 1 })
      ).getFirstAsync();
      expect(result).not.toBeNull();
      result = await (
        await statement.executeAsync<UserEntity>({ ':name': 'Tim Duncan', ':k': -1 })
      ).getFirstAsync();
      expect(result).toBeNull();
      await statement.finalizeAsync();
    });

    it('should support array named parameter binding - @VVV', async () => {
      const statement = await db.prepareAsync('SELECT * FROM users WHERE name = @name AND k = @k');
      let result = await (
        await statement.executeAsync<UserEntity>({ '@name': 'Tim Duncan', '@k': 1 })
      ).getFirstAsync();
      expect(result).not.toBeNull();
      result = await (
        await statement.executeAsync<UserEntity>({ '@name': 'Tim Duncan', '@k': -1 })
      ).getFirstAsync();
      expect(result).toBeNull();
      await statement.finalizeAsync();
    });

    it('should support blob data with Uint8Array', async () => {
      await db.execAsync(`
  DROP TABLE IF EXISTS blobs;
  CREATE TABLE IF NOT EXISTS blobs (id INTEGER PRIMARY KEY NOT NULL, data BLOB);`);

      const blob = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      await db.runAsync('INSERT INTO blobs (data) VALUES (?)', blob);

      const statement = await db.prepareAsync('SELECT * FROM blobs');
      const row = await (await statement.executeAsync<{ data: Uint8Array }>()).getFirstAsync();
      await statement.finalizeAsync();
      expect(row.data).toEqual(blob);
      const row2 = db.getFirstSync<{ data: Uint8Array }>('SELECT * FROM blobs');
      expect(row2.data).toEqual(blob);
    });
  });

  describe('withTransactionAsync', () => {
    let db: SQLite.SQLiteDatabase;

    afterEach(async () => {
      await db.closeAsync();
    });

    it('should support async transaction', async () => {
      db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      async function fakeUserFetcher(userID) {
        switch (userID) {
          case 1: {
            return Promise.resolve('Tim Duncan');
          }
          case 2: {
            return Promise.resolve('Manu Ginobili');
          }
          case 3: {
            return Promise.resolve('Nikhilesh Sigatapu');
          }
          default: {
            return null;
          }
        }
      }

      const userName = await fakeUserFetcher(1);
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO users (name) VALUES (?)', [userName]);
        const result = await db.getFirstAsync<UserEntity>('SELECT * FROM users LIMIT 1');
        expect(result.name).toEqual('Tim Duncan');
      });
    });

    it('should support Promise.all', async () => {
      db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      await db.withTransactionAsync(async () => {
        const statement = await db.prepareAsync('INSERT INTO users (name) VALUES (?)');
        await Promise.all([
          statement.executeAsync('aaa'),
          statement.executeAsync(['bbb']),
          statement.executeAsync('ccc'),
        ]);

        await statement.finalizeAsync();
        const result = await db.getFirstAsync<any>('SELECT COUNT(*) FROM users');
        expect(result['COUNT(*)']).toEqual(3);
      });
    });

    it('should rollback transaction when exception happens inside a transaction', async () => {
      db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
`);

      await db.runAsync('INSERT INTO users (name) VALUES (?)', ['aaa']);
      expect((await db.getFirstAsync<any>('SELECT COUNT(*) FROM users'))['COUNT(*)']).toBe(1);

      let error = null;
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('INSERT INTO users (name) VALUES (?)', ['bbb']);
          await db.runAsync('INSERT INTO users (name) VALUES (?)', ['ccc']);
          // exeuting invalid sql statement will throw an exception
          await db.runAsync('INSERT2');
        });
      } catch (e) {
        error = e;
      }
      expect(error).not.toBeNull();

      expect((await db.getFirstAsync<any>('SELECT COUNT(*) FROM users'))['COUNT(*)']).toBe(1);
    });

    it('withTransactionAsync could possibly have other async queries interrupted inside the transaction', async () => {
      db = await SQLite.openDatabaseAsync('test.db');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
INSERT INTO users (name) VALUES ('aaa');
  `);

      const promise1 = db.withTransactionAsync(async () => {
        for (let i = 0; i < 10; ++i) {
          const result = await db?.getFirstAsync<{ name: string }>('SELECT name FROM users');
          if (result?.name !== 'aaa') {
            throw new Error(`Exception from promise1: Expected aaa but received ${result?.name}}`);
          }
          await db?.runAsync('UPDATE users SET name = ?', 'aaa');
          await delayAsync(200);
        }
      });

      const promise2 = new Promise(async (resolve, reject) => {
        try {
          await delayAsync(100);
          await db?.runAsync('UPDATE users SET name = ?', 'bbb');
          const result = await db?.getFirstAsync<{ name: string }>('SELECT name FROM users');
          if (result?.name !== 'bbb') {
            throw new Error(`Exception from promise2: Expected bbb but received ${result?.name}}`);
          }
          resolve(null);
        } catch (e) {
          reject(new Error(`Exception from promise2: ${e.toString()}`));
        }
      });

      const [result1, result2] = await Promise.allSettled([promise1, promise2]);
      expect(result1.status).toBe('rejected');
      expect(result2.status).toBe('fulfilled');
      const error = (result1 as PromiseRejectedResult).reason;
      expect(error.toString()).toMatch(/Exception from promise1: Expected aaa but received bbb/);
    });

    it('withExclusiveTransactionAsync should execute a transaction atomically and abort other write query', async () => {
      db = await SQLite.openDatabaseAsync('test.db');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64));
INSERT INTO users (name) VALUES ('aaa');
  `);

      const promise1 = db.withExclusiveTransactionAsync(async (txn) => {
        for (let i = 0; i < 10; ++i) {
          const result = await txn.getFirstAsync<{ name: string }>('SELECT name FROM users');
          if (result?.name !== 'aaa') {
            throw new Error(`Exception from promise1: Expected aaa but received ${result?.name}}`);
          }
          await txn.runAsync('UPDATE users SET name = ?', 'aaa');
          await delayAsync(200);
        }
      });

      const promise2 = new Promise(async (resolve, reject) => {
        try {
          await delayAsync(100);
          await db?.runAsync('UPDATE users SET name = ?', 'bbb');
          const result = await db?.getFirstAsync<{ name: string }>('SELECT name FROM users');
          if (result?.name !== 'bbb') {
            throw new Error(`Exception from promise2: Expected bbb but received ${result?.name}}`);
          }
          resolve(null);
        } catch (e) {
          reject(new Error(`Exception from promise2: ${e.toString()}`));
        }
      });

      const [result1, result2] = await Promise.allSettled([promise1, promise2]);
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('rejected');
      const error = (result2 as PromiseRejectedResult).reason;
      expect(error.toString()).toMatch(/Exception from promise2:[\s\S]*database is locked/);
    });
  });

  describe('Synchronous calls', () => {
    let db: SQLite.SQLiteDatabase | null = null;

    beforeEach(() => {
      db = SQLite.openDatabaseSync(':memory:');
      db.execSync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
INSERT INTO users (user_id, name, k, j) VALUES (1, 'Tim Duncan', 1, 23.4);
INSERT INTO users (user_id, name, k, j) VALUES (2, 'Manu Ginobili', 5, 72.8);
INSERT INTO users (user_id, name, k, j) VALUES (3, 'Nikhilesh Sigatapu', 7, 42.14);
`);
    });

    afterEach(() => {
      db?.closeSync();
    });

    it('Basic CRUD', () => {
      const result = db.runSync('INSERT INTO users (name, k, j) VALUES (?, ?, ?)', 'aaa', 1, 2.3);
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowId > 0).toBeTruthy();
      expect(db.getAllSync<UserEntity>('SELECT * FROM users').length).toBe(4);
      expect(
        db.getFirstSync<UserEntity>('SELECT * FROM users WHERE name = ?', 'aaa')
      ).not.toBeNull();

      db.runSync('UPDATE users SET name = ? WHERE name = ?', 'bbb', 'aaa');
      expect(db.getFirstSync<UserEntity>('SELECT * FROM users WHERE name = ?', 'aaa')).toBeNull();
      expect(
        db.getFirstSync<UserEntity>('SELECT * FROM users WHERE name = ?', 'bbb')
      ).not.toBeNull();

      db.runSync('DELETE FROM users WHERE name = ?', 'bbb');
      expect(db.getFirstSync<UserEntity>('SELECT * FROM users WHERE name = ?', 'bbb')).toBeNull();
      expect(db.getAllSync<UserEntity>('SELECT * FROM users').length).toBe(3);
    });

    it('eachSync should return iterable', () => {
      const results: UserEntity[] = [];
      const statement = db.prepareSync('SELECT * FROM users ORDER BY user_id DESC');
      const result = statement.executeSync<UserEntity>();
      for (const row of result) {
        results.push(row);
      }
      statement.finalizeSync();
      expect(results.length).toBe(3);
      expect(results[0].name).toBe('Nikhilesh Sigatapu');
      expect(results[1].name).toBe('Manu Ginobili');
      expect(results[2].name).toBe('Tim Duncan');
    });

    it('withTransactionSync should commit changes', () => {
      db.withTransactionSync(() => {
        db?.runSync('INSERT INTO users (name, k, j) VALUES (?, ?, ?)', 'aaa', 1, 2.3);
      });
      const results = db.getAllSync<UserEntity>('SELECT * FROM users');
      expect(results.length).toBe(4);
    });

    it('withTransactionSync should rollback changes when exceptions happen', () => {
      expect(() => {
        db?.withTransactionSync(() => {
          db?.runSync('DELETE FROM users');
          throw new Error('Exception inside transaction');
        });
      }).toThrow();

      const results = db.getAllSync<UserEntity>('SELECT * FROM users');
      expect(results.length > 0).toBe(true);
    });
  });

  describe('CR-SQLite', () => {
    it('should load crsqlite extension correctly', async () => {
      const db = await SQLite.openDatabaseAsync('test.db', { enableCRSQLite: true });
      await db.execAsync(`
DROP TABLE IF EXISTS foo;
CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER);
`);

      await db.getFirstAsync(`SELECT crsql_as_crr("foo")`);
      await db.runAsync('INSERT INTO foo (a, b) VALUES (?, ?)', 1, 2);
      await db.runAsync('INSERT INTO foo (a, b) VALUES (?, ?)', [3, 4]);
      const result = await db.getFirstAsync<any>(`SELECT * FROM crsql_changes`);
      expect(result.table).toEqual('foo');
      expect(result.val).toEqual(2);

      await db.closeAsync();
      await SQLite.deleteDatabaseAsync('test.db');
    });
  });

  describe('onDatabaseChange', () => {
    it('should emit onDatabaseChange event when `enableChangeListener` is true', async () => {
      const db = await SQLite.openDatabaseAsync('test.db', { enableChangeListener: true });
      await db.execAsync(`
DROP TABLE IF EXISTS foo;
CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER);
`);

      const waitChangePromise = new Promise((resolve) => {
        SQLite.addDatabaseChangeListener(({ databaseName, databaseFilePath, tableName, rowId }) => {
          expect(databaseName).toEqual('main');
          expect(path.basename(databaseFilePath)).toEqual('test.db');
          expect(tableName).toEqual('foo');
          expect(rowId).toBeDefined();
          resolve(null);
        });
      });

      const delayedInsertPromise = new Promise((resolve) => setTimeout(resolve, 0)).then(() =>
        db.runAsync('INSERT INTO foo (a, b) VALUES (?, ?)', 1, 2)
      );

      await Promise.all([waitChangePromise, delayedInsertPromise]);

      await db.closeAsync();
    }, 10000);
  });

  describe('Error handling', () => {
    it('finalizeUnusedStatementsBeforeClosing should close all unclosed statements', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.prepareAsync('SELECT sqlite_version()');

      let error = null;
      try {
        await db.closeAsync();
      } catch (e) {
        error = e;
      }
      expect(error).toBeNull();
    });

    it('disable finalizeUnusedStatementsBeforeClosing should have unclosed statements error when closing db', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:', {
        finalizeUnusedStatementsBeforeClosing: false,
      });
      await db.prepareAsync('SELECT sqlite_version()');

      let error = null;
      try {
        await db.closeAsync();
      } catch (e) {
        error = e;
      }
      expect(error.toString()).toMatch(/unable to close due to unfinalized statements/);
    });
  });

  describe('Database - serialize / deserialize', () => {
    it('serialize / deserialize in between should keep the data', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync(`
DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY NOT NULL, name VARCHAR(64), k INT, j REAL);
INSERT INTO users (user_id, name, k, j) VALUES (1, 'Tim Duncan', 1, 23.4);
INSERT INTO users (user_id, name, k, j) VALUES (2, 'Manu Ginobili', 5, 72.8);
INSERT INTO users (user_id, name, k, j) VALUES (3, 'Nikhilesh Sigatapu', 7, 42.14);
`);

      const serialized = await db.serializeAsync();
      await db.closeAsync();
      const db2 = await SQLite.deserializeDatabaseAsync(serialized);

      const result = await db2.getAllAsync<UserEntity>('SELECT * FROM users');
      expect(result.length).toBe(3);
      await db2.closeAsync();
    });
  });
}

async function delayAsync(timeMs: number) {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}
