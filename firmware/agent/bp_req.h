// One parsed request line.
#pragma once

#include "bp_json.h"

struct BpReq {
  bool hasId;
  long id;
  bpjson::Doc doc;
};
