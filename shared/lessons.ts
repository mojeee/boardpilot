// Learn: short visual lessons on embedded systems, from zero to the road to senior.
// Every text here is an i18n key: the Italian lives in shared/i18n/it/lessons.ts and
// tests/lessons.test.ts checks that nothing is missing. Code blocks are not translated.

export type WidgetId =
  | 'mcu-anatomy'
  | 'memory-map'
  | 'register'
  | 'gpio'
  | 'timer'
  | 'interrupt'
  | 'protocols'
  | 'adc'
  | 'rtos'
  | 'pwm'
  | 'state-machine'
  | 'roadmap'
  | 'led-resistor'
  | 'divider'
  | 'pullup';

export type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'code'; code: string }
  /** monoCols: columns shown as code and not translated */
  | { kind: 'table'; head: string[]; rows: string[][]; monoCols?: number[] }
  | { kind: 'widget'; id: WidgetId }
  /** "In real products": what goes wrong outside the classroom */
  | { kind: 'tip'; text: string }
  | LabBlock
  /**
   * "Show on the 3D board": a temporary preview with these pins highlighted, optionally with parts
   * wired to them. The user's project is never touched.
   */
  | {
      kind: 'board';
      board: string;
      label: string;
      pins: string[];
      parts?: { id: string; partId: string; position: [number, number, number] }[];
      wires?: { pin: string; part: string; partPin: string }[];
    };

/** A hands-on lab at the end of a lesson: runs a lab flow (flows/labs.ts), checked with live data. */
export type LabBlock = { kind: 'lab'; flow: 'lab-blink' | 'lab-button' | 'lab-adc' | 'lab-i2c'; text: string };

export type TrackId = 'foundations' | 'senior';

export interface Lesson {
  id: string;
  track: TrackId;
  title: string;
  summary: string;
  minutes: number;
  blocks: LessonBlock[];
  /** Questions real interviews ask about this topic */
  interview: string[];
}

export const TRACKS: { id: TrackId; label: string; hint: string }[] = [
  { id: 'foundations', label: 'Foundations', hint: 'The core ideas of every embedded device' },
  { id: 'senior', label: 'Road to senior', hint: 'What to learn next, and in which order' },
];

export const LESSONS: Lesson[] = [
  {
    id: 'what-is-mcu',
    track: 'foundations',
    title: 'What is a microcontroller?',
    summary: 'The tiny computer inside every device',
    minutes: 10,
    blocks: [
      { kind: 'p', text: 'An embedded system is a small computer built into a device to do one job: a thermostat, a washing machine, the brakes of a car. Its heart is a microcontroller (MCU): one chip that holds a whole computer.' },
      { kind: 'widget', id: 'mcu-anatomy' },
      { kind: 'p', text: 'Every device follows the same pattern: read the inputs, decide in code, drive the outputs.' },
      { kind: 'h', text: 'Microcontroller or microprocessor?' },
      {
        kind: 'table',
        head: ['', 'Microcontroller (MCU)', 'Microprocessor (MPU)'],
        rows: [
          ['On the chip', 'CPU, memory and peripherals', 'Mostly the CPU'],
          ['Memory', 'Kilobytes', 'Gigabytes'],
          ['Software', 'Your C code, or a small RTOS', 'A full operating system such as Linux'],
          ['Starts in', 'Microseconds', 'Seconds'],
          ['Examples', 'STM32, ESP32, ATmega', 'Raspberry Pi, phones, laptops'],
        ],
      },
      { kind: 'h', text: 'Everything is an address' },
      { kind: 'p', text: 'The CPU sees flash, RAM and the hardware as one long list of numbered addresses. Reading a variable and switching on an LED are the same operation: write a value to an address.' },
      { kind: 'widget', id: 'memory-map' },
      { kind: 'board', board: 'nucleo-f401re', pins: ['D13'], label: 'PA5 on a NUCLEO-F401RE: the pin behind the address in the code below, wired to the green LED' },
      {
        kind: 'code',
        code: `int counter = 5;                              // the compiler picks an address in RAM

*(volatile uint32_t *)0x40020014 = (1 << 5);  // GPIOA output register: pin PA5 high, LED on`,
      },
      { kind: 'h', text: 'What happens at power on' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'The CPU reads the vector table at the start of flash: where the stack begins and where the startup code is.',
          'The startup code copies the initial values of variables into RAM and sets the clock.',
          'Your main() runs, and never returns: there is no operating system to return to.',
        ],
      },
    ],
    interview: [
      'What is the difference between a microcontroller and a microprocessor?',
      'Where do the code and the variables live in an MCU?',
      'What happens between reset and main()?',
    ],
  },
  {
    id: 'hardware-basics',
    track: 'foundations',
    title: 'Hardware basics for software developers',
    summary: 'Voltage, current, resistors, and how not to burn a pin',
    minutes: 15,
    blocks: [
      { kind: 'p', text: 'Code can be undone; a burnt LED or a dead pin cannot. Three numbers explain almost every hardware mistake a beginner makes: voltage, current and resistance.' },
      {
        kind: 'table',
        head: ['Quantity', 'What it is', 'Unit', 'Water picture'],
        rows: [
          ['Voltage (V)', 'The push that moves electrons', 'volt (V)', 'Water pressure'],
          ['Current (I)', 'How much flows', 'ampere (A), usually mA', 'Litres per second'],
          ['Resistance (R)', 'How hard it is to flow', 'ohm (Ω)', 'A narrow pipe'],
        ],
      },
      { kind: 'h', text: 'Ohm’s law: V = I × R' },
      { kind: 'p', text: 'Know two of the three and you get the third. It tells you how big a resistor must be, how much current a pin sends, and how hot a part gets (power = V × I).' },
      { kind: 'h', text: 'An LED always needs a resistor' },
      { kind: 'p', text: 'An LED drops an almost fixed voltage (about 2 V for red, about 3 V for blue and white). Whatever is left over must be taken by a resistor, or the current rises until the LED or the pin dies. Most pins are happy with 5 to 10 mA.' },
      { kind: 'widget', id: 'led-resistor' },
      {
        kind: 'board',
        board: 'rpi-pico',
        label: 'An LED with its resistor on GP15 of a Raspberry Pi Pico',
        pins: ['GP15'],
        parts: [{ id: 'led1', partId: 'led-resistor', position: [0, 0, 40] }],
        wires: [
          { pin: 'GP15', part: 'led1', partPin: 'A' },
          { pin: 'GND1', part: 'led1', partPin: 'K' },
        ],
      },
      { kind: 'tip', text: 'A GPIO pin is not a power supply. The ESP32 and the Pico give a few mA per pin comfortably; motors, relays, LED strips and servos need a transistor or a driver and their own supply, with the grounds connected.' },
      { kind: 'h', text: 'Pull-up resistors: a defined level' },
      { kind: 'p', text: 'An input connected to nothing floats and reads random values. A pull-up resistor to 3.3 V makes it read HIGH until a button pulls it to GND. Most chips have weak internal pull-ups (INPUT_PULLUP); I2C needs real ones, because the bus must rise fast enough.' },
      { kind: 'widget', id: 'pullup' },
      { kind: 'h', text: 'Voltage dividers' },
      { kind: 'p', text: 'Two resistors in series split a voltage in the ratio of their values. This is how you read a 5 V signal on a 3.3 V pin, or measure a battery with an ADC.' },
      { kind: 'widget', id: 'divider' },
      { kind: 'h', text: '5 V and 3.3 V do not mix' },
      {
        kind: 'list',
        items: [
          'ESP32, Pico, STM32 and nRF52 pins take at most 3.3 V (a few STM32 pins are 5 V tolerant: the board file says which).',
          'A 5 V signal going into a 3.3 V pin: use a divider (one direction) or a level shifter (I2C, both directions).',
          'A 3.3 V signal into a 5 V Arduino usually reads HIGH, but check the part: some need 0.7 × 5 V = 3.5 V.',
          'Always connect the grounds: a voltage only means something against a shared ground.',
        ],
      },
      { kind: 'p', text: 'BoardPilot checks these for you: the wiring rules flag a 5 V part on a 3.3 V pin, a missing ground, and an output on an input-only pin, and the shopping list adds the divider or level shifter you need.' },
      { kind: 'h', text: 'Reading a schematic and a datasheet' },
      {
        kind: 'list',
        items: [
          'A schematic shows connections, not positions: two wires that meet with a dot are connected; lines that cross without a dot are not.',
          'Labels with the same name (3V3, GND, SDA) are connected even when no line joins them.',
          'On a datasheet’s first page: the supply voltage range, the interface (I2C, SPI…) and the I2C address.',
          'Then look for “Absolute maximum ratings”: never go beyond them, not even for a moment.',
        ],
      },
      { kind: 'tip', text: 'Before powering a new circuit, check three things: no wire from power straight to GND, every 5 V part away from 3.3 V pins, and the grounds connected. It takes a minute and saves boards.' },
    ],
    interview: [
      'Why does an LED need a series resistor, and how do you choose its value?',
      'What happens if you leave a GPIO input floating?',
      'How do you connect a 5 V sensor output to a 3.3 V microcontroller?',
      'Why does I2C need pull-up resistors, and what goes wrong if they are too large?',
      'What is the difference between absolute maximum ratings and recommended operating conditions?',
    ],
  },
  {
    id: 'c-bits',
    track: 'foundations',
    title: 'C for embedded',
    summary: 'Exact-size types, bits and volatile',
    minutes: 15,
    blocks: [
      { kind: 'p', text: 'On a microcontroller every register has an exact size, so embedded C uses types with the size in the name.' },
      {
        kind: 'code',
        code: `#include <stdint.h>

uint8_t  a;   // 8 bits, 0..255       (a byte from a sensor)
uint16_t b;   // 16 bits, 0..65535    (an ADC reading)
uint32_t c;   // 32 bits              (a hardware register)
int16_t  t;   // signed 16 bits       (a temperature, can be negative)`,
      },
      { kind: 'p', text: 'Never use a plain int for hardware: its size changes from chip to chip.' },
      { kind: 'h', text: 'A register is a row of switches' },
      { kind: 'p', text: 'Each bit of a register controls one thing: a pin, a feature, a flag. The job is almost always to change one bit without touching the others. Try it here.' },
      { kind: 'widget', id: 'register' },
      {
        kind: 'table',
        head: ['Goal', 'Code', 'Why it works'],
        monoCols: [1],
        rows: [
          ['Turn a bit on', 'REG |= (1 << n);', 'OR with 1 forces it to 1'],
          ['Turn a bit off', 'REG &= ~(1 << n);', 'AND with 0 forces it to 0'],
          ['Flip a bit', 'REG ^= (1 << n);', 'XOR with 1 flips it'],
          ['Check a bit', 'if (REG & (1 << n))', 'The result is not zero only if the bit is 1'],
        ],
      },
      { kind: 'h', text: 'volatile: read the hardware every time' },
      { kind: 'p', text: 'The compiler removes reads it thinks are useless. The hardware changes values behind its back, so registers and variables shared with interrupts must be volatile.' },
      {
        kind: 'code',
        code: `volatile uint32_t *status = (volatile uint32_t *)0x40011000;
while ((*status & (1 << 5)) == 0) { }   // wait for the "data ready" bit`,
      },
      { kind: 'tip', text: 'A missing volatile is a classic bug: the code works in a debug build and hangs as soon as optimisation is switched on.' },
    ],
    interview: [
      'How do you set, clear and toggle one bit without changing the others?',
      'What does volatile do, and when is it required?',
      'Why use uint32_t instead of int for a register?',
    ],
  },
  {
    id: 'gpio',
    track: 'foundations',
    title: 'GPIO: pins in and out',
    summary: 'Light an LED, read a button',
    minutes: 15,
    blocks: [
      { kind: 'p', text: 'GPIO means general-purpose input/output. A pin set as output puts 3.3 V or 0 V on the wire. A pin set as input reads the voltage that comes from outside.' },
      { kind: 'widget', id: 'gpio' },
      {
        kind: 'board',
        board: 'esp32-devkitc-30',
        label: 'An LED on an output pin and a button on an input pin, on an ESP32',
        pins: ['D25', 'D26'],
        parts: [
          { id: 'led1', partId: 'led-resistor', position: [-30, 0, 45] },
          { id: 'btn1', partId: 'push-button', position: [30, 0, 45] },
        ],
        wires: [
          { pin: 'D25', part: 'led1', partPin: 'A' },
          { pin: 'GND1', part: 'led1', partPin: 'K' },
          { pin: 'D26', part: 'btn1', partPin: '1' },
          { pin: 'GND2', part: 'btn1', partPin: '2' },
        ],
      },
      { kind: 'p', text: 'With a pull-up resistor the pin reads 1 when nobody touches the button. Pressing it connects the pin to ground, so pressed reads 0. It feels backwards at first, but it is the standard way to wire a button.' },
      { kind: 'h', text: 'Three steps for any pin' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'Turn on the clock of the port. Peripherals start switched off to save power; forgetting this is the most common beginner bug.',
          'Set the pin mode: input, output, alternate function (UART, I2C and others) or analog.',
          'Write the output register, or read the input register.',
        ],
      },
      {
        kind: 'code',
        code: `// NUCLEO-F401RE: green LED on PA5, blue button on PC13
RCC->AHB1ENR |= (1 << 0) | (1 << 2);   // 1. clock on for ports A and C
GPIOA->MODER &= ~(3 << (5 * 2));       // 2. PA5: clear its two mode bits
GPIOA->MODER |=  (1 << (5 * 2));       //    01 = output

while (1) {                            // 3. read the button, drive the LED
    if ((GPIOC->IDR & (1 << 13)) == 0) GPIOA->ODR |=  (1 << 5);
    else                               GPIOA->ODR &= ~(1 << 5);
}`,
      },
      { kind: 'tip', text: 'Real buttons bounce: for a few milliseconds the contact flickers between 0 and 1. Filter it in software (debounce), or one press counts as several.' },
      { kind: 'p', text: 'In BoardPilot, Test hardware reads and drives real pins, and the 3D board shows every pin you use.' },
      { kind: 'lab', flow: 'lab-blink', text: 'Blink an LED on your board: the app switches the pin, reads it back and asks what the LED did.' },
      { kind: 'lab', flow: 'lab-button', text: 'Read a button: the app checks the pull-up, then watches the pin go from 1 to 0 while you press.' },
    ],
    interview: [
      'What is a pull-up resistor and why does a button need one?',
      'What is switch bounce and how do you handle it?',
      'Why must you enable a peripheral clock before using it?',
    ],
  },
  {
    id: 'timers-interrupts',
    track: 'foundations',
    title: 'Timers and interrupts',
    summary: 'Exact timing without wasting the CPU',
    minutes: 15,
    blocks: [
      { kind: 'p', text: 'A delay loop keeps the whole CPU busy doing nothing, and its timing is a guess. Two hardware features fix this: timers and interrupts.' },
      { kind: 'h', text: 'Timers: a counter that counts by itself' },
      { kind: 'p', text: 'The prescaler (PSC) slows the clock down, and the counter starts again from 0 every time it reaches the reload value (ARR). Each restart is an update event.' },
      { kind: 'widget', id: 'timer' },
      { kind: 'h', text: 'Interrupts: the hardware taps the CPU on the shoulder' },
      { kind: 'p', text: 'When an event happens, the CPU pauses your code, runs a short function called an interrupt service routine (ISR), then continues exactly where it stopped. For a software developer: an event callback, triggered by hardware.' },
      { kind: 'widget', id: 'interrupt' },
      {
        kind: 'board',
        board: 'rpi-pico',
        label: 'A button that triggers an interrupt, and the LED the handler switches, on a Raspberry Pi Pico',
        pins: ['GP14', 'GP15'],
        parts: [
          { id: 'btn1', partId: 'push-button', position: [-25, 0, 40] },
          { id: 'led1', partId: 'led-resistor', position: [25, 0, 40] },
        ],
        wires: [
          { pin: 'GP14', part: 'btn1', partPin: '1' },
          { pin: 'GND1', part: 'btn1', partPin: '2' },
          { pin: 'GP15', part: 'led1', partPin: 'A' },
          { pin: 'GND2', part: 'led1', partPin: 'K' },
        ],
      },
      {
        kind: 'code',
        code: `void TIM2_IRQHandler(void) {           // the name comes from the vector table
    if (TIM2->SR & (1 << 0)) {         // update event flag
        TIM2->SR &= ~(1 << 0);         // clear it, or the ISR runs again forever
        GPIOA->ODR ^= (1 << 5);        // toggle the LED
    }
}

// in main(): 16 MHz / 16000 = 1 kHz ticks, 1000 ticks = 1 second
TIM2->PSC = 15999;
TIM2->ARR = 999;
TIM2->DIER |= (1 << 0);                // interrupt on update
TIM2->CR1  |= (1 << 0);                // start counting
NVIC_EnableIRQ(TIM2_IRQn);             // let the CPU accept it`,
      },
      {
        kind: 'list',
        items: [
          'Keep interrupt routines short: set a flag and leave. Heavy work goes in the main loop.',
          'Always clear the interrupt flag.',
          'Mark every variable shared with an interrupt as volatile.',
        ],
      },
    ],
    interview: [
      'What is the difference between polling and interrupts?',
      'Why should an interrupt routine be short?',
      'How do you choose PSC and ARR for an interrupt every second?',
    ],
  },
  {
    id: 'buses',
    track: 'foundations',
    title: 'UART, I2C and SPI',
    summary: 'How chips talk to each other',
    minutes: 12,
    blocks: [
      { kind: 'p', text: 'A microcontroller needs to talk to sensors, screens, memory cards and your computer. Almost everything uses one of three standard buses.' },
      { kind: 'widget', id: 'protocols' },
      {
        kind: 'board',
        board: 'esp32-devkitc-30',
        label: 'An I2C sensor on the ESP32’s default bus: SDA on D21, SCL on D22',
        pins: ['D21', 'D22'],
        parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 50] }],
        wires: [
          { pin: 'D21', part: 'bme1', partPin: 'SDA' },
          { pin: 'D22', part: 'bme1', partPin: 'SCL' },
          { pin: '3V3', part: 'bme1', partPin: 'VIN' },
          { pin: 'GND1', part: 'bme1', partPin: 'GND' },
        ],
      },
      {
        kind: 'table',
        head: ['', 'UART', 'I2C', 'SPI'],
        rows: [
          ['Wires', '2', '2, shared', '3, plus 1 per device'],
          ['Devices', '2', 'Many, by address', 'Several, by select wire'],
          ['Speed', 'Slow', 'Medium', 'Fast'],
          ['Typical use', 'Debug messages to the computer, GPS', 'Sensors, small screens', 'SD cards, displays'],
        ],
      },
      { kind: 'p', text: 'Each bus is a peripheral inside the MCU: you write a byte into its data register and the hardware sends it bit by bit. When a byte arrives, it can raise an interrupt. Same pattern as always: registers and interrupts.' },
      { kind: 'tip', text: 'The most common I2C problems are SDA and SCL swapped, missing pull-up resistors and the wrong address. The BoardPilot Debug wizard checks all three.' },
      { kind: 'lab', flow: 'lab-i2c', text: 'Scan the I2C bus and read your sensor’s chip-ID register.' },
    ],
    interview: [
      'When would you choose SPI instead of I2C?',
      'Why does I2C need pull-up resistors?',
      'What does a NACK on the I2C bus tell you?',
    ],
  },
  {
    id: 'adc',
    track: 'foundations',
    title: 'ADC: reading the analog world',
    summary: 'From a voltage to a number',
    minutes: 10,
    blocks: [
      { kind: 'p', text: 'Temperature, light and pressure change smoothly, but the CPU only understands numbers. The analog-to-digital converter (ADC) takes snapshots of a voltage and rounds each one to the nearest step.' },
      { kind: 'widget', id: 'adc' },
      {
        kind: 'list',
        items: [
          'Resolution is how fine the steps are. A 12-bit ADC has 4096 steps: about 0.8 mV each at 3.3 V.',
          'Sample rate is how often it takes a snapshot. Too slow and fast changes are lost.',
        ],
      },
      {
        kind: 'code',
        code: `uint16_t raw = HAL_ADC_GetValue(&hadc1);   // 0 .. 4095
float volts = raw * 3.3f / 4095;           // 2048 -> 1.65 V
// volts -> temperature, light, pressure: the formula is in the sensor's datasheet`,
      },
      { kind: 'tip', text: 'Every sensor maps voltage to a value in its own way, and the formula is in its datasheet. Reading datasheets is a core embedded skill.' },
      { kind: 'lab', flow: 'lab-adc', text: 'Turn a potentiometer end to end while the app reads the ADC.' },
    ],
    interview: [
      'What limits the accuracy of an ADC reading?',
      'What happens if you sample a signal too slowly?',
      'How do you turn a raw 12-bit reading into volts?',
    ],
  },
  {
    id: 'rtos',
    track: 'foundations',
    title: 'RTOS: many jobs on one chip',
    summary: 'Tasks, priorities and queues',
    minutes: 15,
    blocks: [
      { kind: 'p', text: 'A device may need to read a sensor every 10 ms, update a slow screen and send data, all at once. In a simple loop, a slow job makes the others late. A real-time operating system (RTOS) solves this.' },
      { kind: 'widget', id: 'rtos' },
      {
        kind: 'list',
        items: [
          'A task is a function with its own endless loop, like a thread.',
          'The scheduler runs the most important task that is ready, even if it must pause another one.',
          'A delay puts a task to sleep so the others can use the CPU.',
          'A queue passes data safely from one task to another.',
          'A mutex protects something shared, such as the UART, so two tasks do not use it at the same time.',
        ],
      },
      {
        kind: 'code',
        code: `void SensorTask(void *p) {
    for (;;) {
        float t = read_temperature();
        xQueueSend(tempQueue, &t, 0);          // hand the value to the display task
        vTaskDelay(pdMS_TO_TICKS(10));         // sleep 10 ms, the CPU is free
    }
}

xTaskCreate(SensorTask,  "sensor",  256, NULL, 3, NULL);   // high priority
xTaskCreate(DisplayTask, "display", 256, NULL, 1, NULL);   // low priority
vTaskStartScheduler();                                      // never returns`,
      },
      { kind: 'p', text: 'Real-time does not mean fast. It means predictable: the important task always runs within a known time. The scheduler itself is driven by a timer interrupt.' },
      { kind: 'tip', text: 'Priority inversion: a low-priority task holds a mutex that a high-priority task needs, and a medium task keeps running in between. Use mutexes with priority inheritance.' },
    ],
    interview: [
      'What is priority inversion and how is it solved?',
      'Queue or global variable: how should two tasks share data?',
      'When is a simple loop better than an RTOS?',
    ],
  },
  {
    id: 'essentials',
    track: 'foundations',
    title: 'PWM, state machines and more',
    summary: 'Five ideas every firmware engineer uses',
    minutes: 15,
    blocks: [
      { kind: 'h', text: 'PWM: dimming with fast switching' },
      { kind: 'p', text: 'A pin is either fully on or fully off. Switching it very fast, and choosing the share of time it stays on (the duty cycle), makes an LED or a motor feel the average. A timer does the switching, not the CPU.' },
      { kind: 'widget', id: 'pwm' },
      { kind: 'h', text: 'State machines: how device logic is designed' },
      { kind: 'p', text: 'The device is always in exactly one state, and events move it to another state. Draw the diagram first, then write the code.' },
      { kind: 'widget', id: 'state-machine' },
      {
        kind: 'code',
        code: `typedef enum { IDLE, HEATING, ERROR } State;

switch (state) {
    case IDLE:    if (temp < target)  { heater_on();  state = HEATING; } break;
    case HEATING: if (temp >= target) { heater_off(); state = IDLE;    } break;
    case ERROR:   if (button_pressed)  {               state = IDLE;    } break;
}`,
      },
      { kind: 'h', text: 'DMA, watchdog and low power' },
      {
        kind: 'list',
        items: [
          'DMA moves data (ADC samples, UART bytes, screen pixels) in the background while the CPU does other work, then raises an interrupt when it is done.',
          'A watchdog is a timer that restarts the chip if the code stops feeding it. A frozen device recovers by itself.',
          'Low power: the MCU sleeps almost all the time and wakes only on an interrupt. This is how a battery lasts for years.',
        ],
      },
    ],
    interview: [
      'How does PWM control the speed of a motor?',
      'Why design firmware as a state machine?',
      'How do you feed a watchdog safely when several tasks run?',
    ],
  },
  {
    id: 'full-picture',
    track: 'foundations',
    title: 'The full picture',
    summary: 'One device, one cycle, every lesson',
    minutes: 8,
    blocks: [
      { kind: 'p', text: 'Follow one cycle of a thermostat. Every embedded device, from a toy to a car, repeats the same pattern: wait, sense, decide, act, sleep.' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'Power on: the CPU runs the program from flash and sets up pins, buses and timers.',
          'The timer counts by itself while the CPU rests.',
          'The timer raises an interrupt and the scheduler wakes the sensor task.',
          'Over I2C, the MCU asks the sensor for the temperature.',
          'The code compares it with the target and sets one GPIO bit: the heater turns on.',
          'The display task draws the new value on the screen.',
          'A button press raises an interrupt and changes the target.',
          'Everything is done: the CPU sleeps until the next tick.',
        ],
      },
      { kind: 'h', text: 'The device is like a body' },
      {
        kind: 'table',
        head: ['Body', 'Embedded'],
        rows: [
          ['Brain', 'CPU'],
          ['Long-term memory', 'Flash, where the program lives'],
          ['Short-term memory', 'RAM, where the variables live'],
          ['Heartbeat', 'Timer'],
          ['Reflex', 'Interrupt'],
          ['Eyes and skin', 'Sensors and ADC'],
          ['Muscles', 'Outputs: LEDs, motors, heaters'],
          ['Nerves', 'Wires and buses: I2C, SPI, UART'],
        ],
      },
      { kind: 'h', text: 'From your computer to the chip' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'Write C code in an IDE such as STM32CubeIDE.',
          'The compiler turns it into a binary file.',
          'The programmer on the board (for example ST-LINK) writes the binary into flash. This is flashing.',
          'The MCU restarts and runs your code.',
          'The debugger pauses the chip so you can look at variables and registers, line by line.',
        ],
      },
      { kind: 'p', text: 'In BoardPilot, Flash firmware backs up the board before it writes, and Monitor shows what your code prints.' },
    ],
    interview: [
      'Walk me through what happens from power on to the first sensor reading.',
      'How does the code get from your computer into the chip?',
    ],
  },
  {
    id: 'road-to-senior',
    track: 'senior',
    title: 'The road to senior',
    summary: 'Five stages and three portfolio projects',
    minutes: 10,
    blocks: [
      { kind: 'p', text: 'Senior in embedded usually means years of shipping real products. Software seniority counts: architecture, testing and owning a system end to end transfer directly. The fastest path is to learn deeply, build three serious projects and use what makes you different.' },
      { kind: 'widget', id: 'roadmap' },
      {
        kind: 'list',
        items: [
          'Stage 1, hands-on core: the Foundations lessons on a real board, plus hardware basics: Ohm’s law, schematics, datasheets, logic analyser and oscilloscope.',
          'Stage 2, firmware architecture: driver layers, RTOS in depth (races, deadlock, priority inversion), memory layout and linker scripts, a bootloader.',
          'Stage 3, professional practice: unit tests on the computer, continuous integration, finding the cause of crashes (hard faults), MISRA C, modern C++ for embedded.',
          'Stage 4, senior system skills: hardware and software trade-offs, secure boot, over-the-air updates, reliability, CAN and Modbus, safety standards, Embedded Linux.',
          'Stage 5, Edge AI: machine-learning models running on microcontrollers (TensorFlow Lite Micro, STM32Cube.AI), quantisation, predictive maintenance.',
        ],
      },
      { kind: 'h', text: 'Three portfolio projects' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'Smart room monitor: sensors, screen, alarm and logs, first without and then with FreeRTOS.',
          'Industrial sensor node: Modbus or CAN, a bootloader with remote updates, unit tests and CI.',
          'Predictive maintenance device: a vibration sensor and an anomaly-detection model running on the MCU.',
        ],
      },
      { kind: 'tip', text: 'Interviews for senior roles test depth: not what an interrupt is, but why a device failed in the field and how you proved it.' },
    ],
    interview: [
      'Tell me about a bug that only happened on real hardware, and how you found it.',
      'How would you design firmware updates so a device can never be bricked?',
    ],
  },
];

/** Every translatable string of a lesson (used by the translation test). */
export function lessonTexts(l: Lesson): string[] {
  const out = [l.title, l.summary, ...l.interview];
  for (const b of l.blocks) {
    if (b.kind === 'p' || b.kind === 'h' || b.kind === 'tip' || b.kind === 'lab') out.push(b.text);
    else if (b.kind === 'board') out.push(b.label);
    else if (b.kind === 'list') out.push(...b.items);
    else if (b.kind === 'table') {
      out.push(...b.head);
      for (const r of b.rows) r.forEach((c, i) => b.monoCols?.includes(i) || out.push(c));
    }
  }
  return out.filter((s) => s.trim() !== '');
}
