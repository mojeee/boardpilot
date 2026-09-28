import type { BoardPilotApi } from '../../shared/api';

declare global {
  interface Window {
    bp: BoardPilotApi;
  }
}
export {};
