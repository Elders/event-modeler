// The spec use-case's view of its model: re-exports the pure spec geometry from
// the domain, plus the store-backed registry read. Spec feature modules import
// from here so geometry and persistence arrive through one door.

export * from '../../domain/spec';
export {
  SPECS_KEY,
  SLICES_KEY,
  LINKS_KEY,
  type FrameRecord,
  type SpecLink,
} from '../../domain/records';

import { SPECS_KEY, type FrameRecord } from '../../domain/records';
import { readRecords } from '../helpers';

export async function readSpecRecords(): Promise<FrameRecord[]> {
  return readRecords(SPECS_KEY);
}
