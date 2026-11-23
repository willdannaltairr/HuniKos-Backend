import { query } from '../../config/db.js'

export interface Facility {
  id: string
  name: string
}

export async function listFacilities(): Promise<Facility[]> {
  const { rows } = await query<Facility>('SELECT id, name FROM facilities ORDER BY name ASC')
  return rows
}
