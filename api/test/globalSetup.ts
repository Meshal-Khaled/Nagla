import { resetTestDb } from './db.js';

export default async function setup() {
  await resetTestDb();
}
