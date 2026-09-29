import type { FlowDef } from '@shared/flow';
import { connectIdentify } from './connect-identify';
import { debugSensorNotResponding } from './debug-sensor-not-responding';
import { debugBoardNotDetected } from './debug-board-not-detected';
import { debugKeepsResetting } from './debug-keeps-resetting';
import { debugGarbageOnSerial } from './debug-garbage-on-serial';
import { flashFirmware } from './flash-firmware';
import { LABS } from './labs';

export const FLOWS: Record<string, FlowDef> = Object.fromEntries(
  [connectIdentify, debugSensorNotResponding, debugBoardNotDetected, debugKeepsResetting, debugGarbageOnSerial, flashFirmware, ...LABS].map((f) => [f.id, f]),
);

/** Symptoms offered by "Debug a problem", each mapped to a flow. */
export const DEBUG_SYMPTOMS = [
  { id: 'debug-sensor-not-responding', label: 'A sensor does not respond', hint: 'Not found, zeros, wrong values' },
  { id: 'debug-board-not-detected', label: 'The board is not detected', hint: 'No port, upload fails to connect' },
  { id: 'debug-keeps-resetting', label: 'The board keeps restarting', hint: 'Boot loop, brownout, crashes' },
  { id: 'debug-garbage-on-serial', label: 'Garbage on the serial monitor', hint: 'Strange characters instead of text' },
];
