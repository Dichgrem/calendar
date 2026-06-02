// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDrizzleDb = any;

let _db: AnyDrizzleDb = null;
let _rawConnection: unknown = null;

export function setDb(d: AnyDrizzleDb): void {
  _db = d;
}

export function setRawConnection(c: unknown): void {
  _rawConnection = c;
}

export const db = new Proxy({} as AnyDrizzleDb, {
  get(_, prop) {
    if (!_db) throw new Error("DB not initialized");
    return _db[prop];
  },
});

export function getRawConnection() {
  return _rawConnection;
}
