// The chip tool for each board family (esptool has its own wrapper in ../esptool.ts).

import type { BoardDef } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import type { ChipTool } from './proc';
import { avrdudeTool } from './avrdude';
import { picotoolTool } from './picotool';
import { stm32Tool } from './stm32';
import { nrfjprogTool } from './nrfjprog';
import { teensyTool } from './teensy';

const TOOLS: Partial<Record<BoardDef['toolchain']['flasher'], ChipTool>> = {
  avrdude: avrdudeTool,
  picotool: picotoolTool,
  stm32: stm32Tool,
  nrfjprog: nrfjprogTool,
  teensy: teensyTool,
};

export function chipTool(board: BoardDef): ChipTool {
  const tool = TOOLS[board.toolchain.flasher];
  if (!tool) throw new DriverError('no_tool', t('The app has no flashing tool for this board yet.'), t('You can still check the wiring in 3D and use the serial monitor.'));
  return tool;
}
