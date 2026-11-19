import { query } from '../../config/db.js'

export async function listFacilities() {
  const { rows } = await query('SELECT id, name FROM facilities ORDER BY name ASC')
  return rows
}
