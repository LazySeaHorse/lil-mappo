import airportsJson from './airports.json';
import type { RawAirportTuple } from '@/services/airports/types';

export const airportsData: RawAirportTuple[] = airportsJson as RawAirportTuple[];
export default airportsData;
