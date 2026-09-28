// Command handlers of the BoardPilot agent. Each one prints exactly one
// reply line (streams print more lines later from bpStreamTick()).
#pragma once

#include "bp_req.h"

void cmdHello(const BpReq& r);
void cmdPins(const BpReq& r);
void cmdStrapping(const BpReq& r);
void cmdPullupCheck(const BpReq& r);
void cmdI2cScan(const BpReq& r);
void cmdI2cRead(const BpReq& r);
void cmdAdc(const BpReq& r);
void cmdPwm(const BpReq& r);
void cmdGpioWrite(const BpReq& r);
void cmdGpioRead(const BpReq& r);
void cmdStream(const BpReq& r);
void cmdStreamStop(const BpReq& r);
void cmdResetPins(const BpReq& r);

// Emits one stream frame when it is due. Call from loop().
void bpStreamTick();

// Implemented in bp_agent.cpp: prints the strapping object {"0":1,...}
// captured at boot, plus ,"strapReg":"0x.." when the register was read.
void bpPrintStrappingFields();
