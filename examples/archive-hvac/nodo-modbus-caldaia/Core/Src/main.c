/* Nodo Modbus RTU caldaia: due NTC 10k su ADC, RS-485 su USART2 con DE su PB5, relè pompa su PC6 */
#include "main.h"
#include "stm32g0xx_hal.h"
#include "modbus_rtu.h"

#define NTC_BETA 3977.0f  /* NTCLE100E3 10k, B25/85 */
#define MODBUS_BAUD 19200

ADC_HandleTypeDef hadc1;
UART_HandleTypeDef huart2;

static float ntc_to_celsius(uint16_t raw) {
  float r = 10000.0f * raw / (4095.0f - raw);
  return 1.0f / (1.0f / 298.15f + logf(r / 10000.0f) / NTC_BETA) - 273.15f;
}

int main(void) {
  HAL_Init();
  HAL_ADC_Start(&hadc1);
  HAL_UART_Receive_IT(&huart2, rx, 1);
  modbus_init(&huart2, MODBUS_BAUD, 0x11);
  while (1) {
    HAL_ADC_PollForConversion(&hadc1, 10);
    holding[0] = (int16_t)(ntc_to_celsius(HAL_ADC_GetValue(&hadc1)) * 10);
    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_6, coils[0] ? GPIO_PIN_SET : GPIO_PIN_RESET);
    modbus_poll();
  }
}
