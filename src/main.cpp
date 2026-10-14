#include <Arduino.h>
#include <ESP32Servo.h>

// =====================================================
// BUTTON PINS
// =====================================================
const int PIN_DETECT     = 32;
const int PIN_ALUMINUM   = 14;
const int PIN_STEEL      = 17;
const int PIN_PLASTIC    = 19;
const int PIN_UNKNOWN    = 22;
const int PIN_EMERGENCY  = 33;
const int PIN_EMPTY_BIN  = 12;

// =====================================================
// STATUS PINS
// =====================================================
const int PIN_LED_GREEN = 4;
const int PIN_LED_RED   = 5;
const int PIN_BUZZER    = 15;

// =====================================================
// SERVO
// =====================================================
const int PIN_SERVO = 23;

const int SERVO_HOME     = 90;
const int SERVO_ALUMINUM = 30;
const int SERVO_STEEL    = 70;
const int SERVO_PLASTIC  = 110;
const int SERVO_UNKNOWN  = 150;

Servo sortingServo;

// =====================================================
// STEPPER + A4988
// =====================================================
const int PIN_STEP   = 25;
const int PIN_DIR    = 26;
const int PIN_ENABLE = 27;

const unsigned long STEP_INTERVAL = 2000;

unsigned long lastStepTime = 0;

bool conveyorRunning = false;

// =====================================================
// BIN LEVEL SIMULATION
// =====================================================
int aluminumLevel   = 0;
int steelLevel      = 0;
int plasticLevel    = 0;
int inspectionLevel = 0;

const int BIN_INCREMENT = 10;

const int WARNING_LEVEL = 80;
const int FULL_LEVEL    = 90;

// =====================================================
// SYSTEM STATE
// =====================================================
enum SystemState {
  WAIT_MATERIAL,
  WAIT_AI,
  SORTING,
  BIN_FULL_STOP,
  EMERGENCY_STOPPED
};

SystemState state = WAIT_MATERIAL;

// =====================================================
// BUTTON LOCK
// =====================================================
bool detectLocked   = false;
bool aiLocked       = false;
bool emptyBinLocked = false;

// =====================================================
// EMERGENCY
// =====================================================
bool emergencyActive = false;

int lastEmergencyState = HIGH;

// =====================================================
// SORTING DATA
// =====================================================
unsigned long sortingStartTime = 0;

const unsigned long SORTING_TIME = 2000;

String currentMaterial = "";
String currentBin      = "";

// Lưu loại vật liệu bị chặn vì thùng đầy
String blockedMaterial = "";

// =====================================================
// STATUS FUNCTIONS
// =====================================================
void setNormalStatus() {

  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);
}

void setWarningStatus() {

  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, HIGH);

  digitalWrite(PIN_BUZZER, HIGH);

  delay(150);

  digitalWrite(PIN_BUZZER, LOW);
}

void setFullStatus() {

  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, HIGH);
  digitalWrite(PIN_BUZZER, HIGH);
}

// =====================================================
// CONVEYOR FUNCTIONS
// =====================================================
void startConveyor() {

  conveyorRunning = true;

  digitalWrite(PIN_ENABLE, LOW);

  Serial.println("Conveyor: RUNNING");
}

void stopConveyor() {

  conveyorRunning = false;

  digitalWrite(PIN_ENABLE, HIGH);

  Serial.println("Conveyor: STOPPED");
}

void updateConveyor() {

  if (!conveyorRunning) {
    return;
  }

  unsigned long currentTime = micros();

  if (
    currentTime - lastStepTime
    >= STEP_INTERVAL
  ) {

    lastStepTime = currentTime;

    digitalWrite(PIN_STEP, HIGH);

    delayMicroseconds(10);

    digitalWrite(PIN_STEP, LOW);
  }
}

// =====================================================
// BIN FUNCTIONS
// =====================================================
int getBinLevel(String material) {

  if (material == "ALUMINUM") {
    return aluminumLevel;
  }

  if (material == "STEEL") {
    return steelLevel;
  }

  if (material == "PLASTIC") {
    return plasticLevel;
  }

  if (material == "UNKNOWN") {
    return inspectionLevel;
  }

  return 0;
}

String getBinName(String material) {

  if (material == "ALUMINUM") {
    return "ALUMINUM BIN";
  }

  if (material == "STEEL") {
    return "STEEL BIN";
  }

  if (material == "PLASTIC") {
    return "PLASTIC BIN";
  }

  if (material == "UNKNOWN") {
    return "INSPECTION AREA";
  }

  return "UNKNOWN BIN";
}

bool isBinFull(String material) {

  return (
    getBinLevel(material)
    >= FULL_LEVEL
  );
}

// =====================================================
// PRINT BIN STATUS
// =====================================================
void printBinStatus(
  const char *name,
  int level
) {

  Serial.print(name);
  Serial.print(": ");

  Serial.print(level);
  Serial.print("%");

  if (level >= FULL_LEVEL) {

    Serial.println("  [FULL]");
  }

  else if (level >= WARNING_LEVEL) {

    Serial.println("  [WARNING]");
  }

  else {

    Serial.println("  [NORMAL]");
  }
}

// =====================================================
// INCREASE BIN LEVEL
// =====================================================
void increaseBinLevel(String material) {

  int level = 0;

  if (material == "ALUMINUM") {

    aluminumLevel += BIN_INCREMENT;

    if (aluminumLevel > 100) {
      aluminumLevel = 100;
    }

    level = aluminumLevel;

    printBinStatus(
      "ALUMINUM BIN",
      aluminumLevel
    );
  }

  else if (material == "STEEL") {

    steelLevel += BIN_INCREMENT;

    if (steelLevel > 100) {
      steelLevel = 100;
    }

    level = steelLevel;

    printBinStatus(
      "STEEL BIN",
      steelLevel
    );
  }

  else if (material == "PLASTIC") {

    plasticLevel += BIN_INCREMENT;

    if (plasticLevel > 100) {
      plasticLevel = 100;
    }

    level = plasticLevel;

    printBinStatus(
      "PLASTIC BIN",
      plasticLevel
    );
  }

  else if (material == "UNKNOWN") {

    inspectionLevel += BIN_INCREMENT;

    if (inspectionLevel > 100) {
      inspectionLevel = 100;
    }

    level = inspectionLevel;

    printBinStatus(
      "INSPECTION AREA",
      inspectionLevel
    );
  }

  // ===============================================
  // STATUS AFTER SORTING
  // ===============================================
  if (level >= FULL_LEVEL) {

    setFullStatus();

    Serial.println(
      "WARNING: Bin has reached FULL level!"
    );
  }

  else if (level >= WARNING_LEVEL) {

    setWarningStatus();

    Serial.println(
      "WARNING: Bin is nearly full."
    );
  }

  else {

    setNormalStatus();
  }
}

// =====================================================
// BLOCK SORTING WHEN BIN FULL
// =====================================================
void blockSortingBecauseFull(
  const char *material
) {

  blockedMaterial = material;

  String binName =
    getBinName(material);

  int level =
    getBinLevel(material);

  Serial.println();
  Serial.println(
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  );

  Serial.println(
    "WARNING: BIN FULL!"
  );

  Serial.print("Material: ");
  Serial.println(material);

  Serial.print("Bin: ");
  Serial.println(binName);

  Serial.print("Current level: ");

  Serial.print(level);
  Serial.println("%");

  Serial.println(
    "Sorting blocked."
  );

  Serial.println(
    "Please empty the bin."
  );

  Serial.println(
    "Press EMPTY BIN after operator clears the bin."
  );

  Serial.println(
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  );

  stopConveyor();

  sortingServo.write(
    SERVO_HOME
  );

  setFullStatus();

  state = BIN_FULL_STOP;
}

// =====================================================
// EMPTY BIN
// =====================================================
void emptyBlockedBin() {

  Serial.println();
  Serial.println(
    "=============================="
  );

  Serial.println(
    "OPERATOR EMPTY BIN"
  );

  // ---------------------------------
  // ALUMINUM
  // ---------------------------------
  if (
    blockedMaterial
    == "ALUMINUM"
  ) {

    aluminumLevel = 0;

    Serial.println(
      "ALUMINUM BIN emptied."
    );
  }

  // ---------------------------------
  // STEEL
  // ---------------------------------
  else if (
    blockedMaterial
    == "STEEL"
  ) {

    steelLevel = 0;

    Serial.println(
      "STEEL BIN emptied."
    );
  }

  // ---------------------------------
  // PLASTIC
  // ---------------------------------
  else if (
    blockedMaterial
    == "PLASTIC"
  ) {

    plasticLevel = 0;

    Serial.println(
      "PLASTIC BIN emptied."
    );
  }

  // ---------------------------------
  // INSPECTION
  // ---------------------------------
  else if (
    blockedMaterial
    == "UNKNOWN"
  ) {

    inspectionLevel = 0;

    Serial.println(
      "INSPECTION AREA emptied."
    );
  }

  Serial.println(
    "Bin level: 0%"
  );

  blockedMaterial = "";

  currentMaterial = "";
  currentBin = "";

  // Servo về Home
  sortingServo.write(
    SERVO_HOME
  );

  // Tắt cảnh báo
  setNormalStatus();

  // Reset hệ thống
  state = WAIT_MATERIAL;

  detectLocked = false;
  aiLocked = false;

  Serial.println(
    "Warning cleared."
  );

  Serial.println(
    "System ready."
  );

  startConveyor();

  Serial.println(
    "Waiting for material..."
  );

  Serial.println(
    "=============================="
  );
}

// =====================================================
// START SORTING
// =====================================================
void startSorting(
  const char *material,
  int angle,
  const char *binName
) {

  // Kiểm tra thùng trước
  if (
    isBinFull(material)
  ) {

    blockSortingBecauseFull(
      material
    );

    return;
  }

  Serial.println();
  Serial.println(
    "------------------------------"
  );

  Serial.print(
    "AI Result: "
  );

  Serial.println(
    material
  );

  Serial.print(
    "Servo angle: "
  );

  Serial.print(
    angle
  );

  Serial.println(
    " degrees"
  );

  Serial.print(
    "Routing material to: "
  );

  Serial.println(
    binName
  );

  currentMaterial =
    material;

  currentBin =
    binName;

  sortingServo.write(
    angle
  );

  startConveyor();

  sortingStartTime =
    millis();

  state = SORTING;
}

// =====================================================
// EMERGENCY ACTIVATE
// =====================================================
void activateEmergency() {

  emergencyActive = true;

  stopConveyor();

  sortingServo.write(
    SERVO_HOME
  );

  digitalWrite(
    PIN_LED_GREEN,
    LOW
  );

  digitalWrite(
    PIN_LED_RED,
    HIGH
  );

  digitalWrite(
    PIN_BUZZER,
    HIGH
  );

  state =
    EMERGENCY_STOPPED;

  Serial.println();
  Serial.println(
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  );

  Serial.println(
    "EMERGENCY STOP ACTIVATED!"
  );

  Serial.println(
    "Conveyor: STOPPED"
  );

  Serial.println(
    "Servo: HOME (90 degrees)"
  );

  Serial.println(
    "LED RED: ON"
  );

  Serial.println(
    "Buzzer: ON"
  );

  Serial.println(
    "System locked."
  );

  Serial.println(
    "Press EMERGENCY again to reset."
  );

  Serial.println(
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  );
}

// =====================================================
// EMERGENCY RESET
// =====================================================
void resetEmergency() {

  emergencyActive = false;

  setNormalStatus();

  sortingServo.write(
    SERVO_HOME
  );

  currentMaterial = "";
  currentBin = "";

  state = WAIT_MATERIAL;

  detectLocked = false;
  aiLocked = false;

  Serial.println();
  Serial.println(
    "=============================="
  );

  Serial.println(
    "EMERGENCY RESET"
  );

  Serial.println(
    "System ready."
  );

  startConveyor();

  Serial.println(
    "Waiting for material..."
  );
}

// =====================================================
// SETUP
// =====================================================
void setup() {

  Serial.begin(115200);

  delay(1000);

  // =================================================
  // BUTTONS
  // =================================================
  pinMode(
    PIN_DETECT,
    INPUT_PULLUP
  );

  pinMode(
    PIN_ALUMINUM,
    INPUT_PULLUP
  );

  pinMode(
    PIN_STEEL,
    INPUT_PULLUP
  );

  pinMode(
    PIN_PLASTIC,
    INPUT_PULLUP
  );

  pinMode(
    PIN_UNKNOWN,
    INPUT_PULLUP
  );

  pinMode(
    PIN_EMERGENCY,
    INPUT_PULLUP
  );

  pinMode(
    PIN_EMPTY_BIN,
    INPUT_PULLUP
  );

  // =================================================
  // STATUS
  // =================================================
  pinMode(
    PIN_LED_GREEN,
    OUTPUT
  );

  pinMode(
    PIN_LED_RED,
    OUTPUT
  );

  pinMode(
    PIN_BUZZER,
    OUTPUT
  );

  setNormalStatus();

  // =================================================
  // SERVO
  // =================================================
  sortingServo.setPeriodHertz(
    50
  );

  sortingServo.attach(
    PIN_SERVO,
    500,
    2400
  );

  sortingServo.write(
    SERVO_HOME
  );

  // =================================================
  // STEPPER
  // =================================================
  pinMode(
    PIN_STEP,
    OUTPUT
  );

  pinMode(
    PIN_DIR,
    OUTPUT
  );

  pinMode(
    PIN_ENABLE,
    OUTPUT
  );

  digitalWrite(
    PIN_DIR,
    HIGH
  );

  digitalWrite(
    PIN_ENABLE,
    HIGH
  );

  // =================================================
  // START
  // =================================================
  Serial.println();
  Serial.println(
    "=============================="
  );

  Serial.println(
    "SMART RECYCLING SYSTEM"
  );

  Serial.println(
    "=============================="
  );

  Serial.println(
    "System ready."
  );

  startConveyor();

  Serial.println(
    "Waiting for material..."
  );
}

// =====================================================
// LOOP
// =====================================================
void loop() {

  // =================================================
  // EMERGENCY STOP
  // PRIORITY HIGHEST
  // =================================================
  int emergencyState =
    digitalRead(
      PIN_EMERGENCY
    );

  if (
    emergencyState == LOW &&
    lastEmergencyState == HIGH
  ) {

    if (!emergencyActive) {

      activateEmergency();
    }

    else {

      resetEmergency();
    }

    delay(50);
  }

  lastEmergencyState =
    emergencyState;

  // Nếu Emergency đang hoạt động
  if (emergencyActive) {

    delay(10);

    return;
  }

  // =================================================
  // UPDATE CONVEYOR
  // =================================================
  updateConveyor();

  // =================================================
  // RESET DETECT LOCK
  // =================================================
  if (
    digitalRead(
      PIN_DETECT
    ) == HIGH
  ) {

    detectLocked = false;
  }

  // =================================================
  // RESET AI LOCK
  // =================================================
  if (
    digitalRead(PIN_ALUMINUM) == HIGH &&
    digitalRead(PIN_STEEL) == HIGH &&
    digitalRead(PIN_PLASTIC) == HIGH &&
    digitalRead(PIN_UNKNOWN) == HIGH
  ) {

    aiLocked = false;
  }

  // =================================================
  // RESET EMPTY BIN LOCK
  // =================================================
  if (
    digitalRead(
      PIN_EMPTY_BIN
    ) == HIGH
  ) {

    emptyBinLocked = false;
  }

  // =================================================
  // BIN FULL STOP
  // =================================================
  if (
    state == BIN_FULL_STOP
  ) {

    if (
      digitalRead(
        PIN_EMPTY_BIN
      ) == LOW &&
      !emptyBinLocked
    ) {

      emptyBinLocked = true;

      emptyBlockedBin();
    }

    delay(10);

    return;
  }

  // =================================================
  // WAIT MATERIAL
  // =================================================
  if (
    state == WAIT_MATERIAL
  ) {

    if (
      digitalRead(
        PIN_DETECT
      ) == LOW &&
      !detectLocked
    ) {

      detectLocked = true;

      Serial.println();
      Serial.println(
        "=============================="
      );

      Serial.println(
        "Material detected!"
      );

      stopConveyor();

      Serial.println(
        "Waiting for AI result..."
      );

      state =
        WAIT_AI;
    }
  }

  // =================================================
  // WAIT AI
  // =================================================
  else if (
    state == WAIT_AI &&
    !aiLocked
  ) {

    // ALUMINUM
    if (
      digitalRead(
        PIN_ALUMINUM
      ) == LOW
    ) {

      aiLocked = true;

      startSorting(
        "ALUMINUM",
        SERVO_ALUMINUM,
        "ALUMINUM BIN"
      );
    }

    // STEEL
    else if (
      digitalRead(
        PIN_STEEL
      ) == LOW
    ) {

      aiLocked = true;

      startSorting(
        "STEEL",
        SERVO_STEEL,
        "STEEL BIN"
      );
    }

    // PLASTIC
    else if (
      digitalRead(
        PIN_PLASTIC
      ) == LOW
    ) {

      aiLocked = true;

      startSorting(
        "PLASTIC",
        SERVO_PLASTIC,
        "PLASTIC BIN"
      );
    }

    // UNKNOWN
    else if (
      digitalRead(
        PIN_UNKNOWN
      ) == LOW
    ) {

      aiLocked = true;

      startSorting(
        "UNKNOWN",
        SERVO_UNKNOWN,
        "INSPECTION AREA"
      );
    }
  }

  // =================================================
  // SORTING
  // =================================================
  else if (
    state == SORTING
  ) {

    if (
      millis() -
      sortingStartTime
      >= SORTING_TIME
    ) {

      Serial.print(
        "Material has reached: "
      );

      Serial.println(
        currentBin
      );

      increaseBinLevel(
        currentMaterial
      );

      sortingServo.write(
        SERVO_HOME
      );

      Serial.println(
        "Servo returned to HOME (90 degrees)."
      );

      Serial.println(
        "Sorting completed."
      );

      Serial.println(
        "------------------------------"
      );

      Serial.println();

      currentMaterial = "";
      currentBin = "";

      state =
        WAIT_MATERIAL;

      Serial.println(
        "Waiting for material..."
      );
    }
  }

  delay(1);
}