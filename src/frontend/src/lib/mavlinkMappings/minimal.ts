/**
 * Micro air vehicle / autopilot classes. This identifies the individual model.
 */
export enum MavAutopilot {
    /**
     * Generic autopilot, full support for everything
     */
    'GENERIC' = 0,
    /**
     * Reserved for future use.
     */
    'RESERVED' = 1,
    /**
     * SLUGS autopilot, http://slugsuav.soe.ucsc.edu
     */
    'SLUGS' = 2,
    /**
     * ArduPilot - Plane/Copter/Rover/Sub/Tracker, https://ardupilot.org
     */
    'ARDUPILOTMEGA' = 3,
    /**
     * OpenPilot, http://openpilot.org
     */
    'OPENPILOT' = 4,
    /**
     * Generic autopilot only supporting simple waypoints
     */
    'GENERIC_WAYPOINTS_ONLY' = 5,
    /**
     * Generic autopilot supporting waypoints and other simple navigation commands
     */
    'GENERIC_WAYPOINTS_AND_SIMPLE_NAVIGATION_ONLY' = 6,
    /**
     * Generic autopilot supporting the full mission command set
     */
    'GENERIC_MISSION_FULL' = 7,
    /**
     * No valid autopilot, e.g. a GCS or other MAVLink component
     */
    'INVALID' = 8,
    /**
     * PPZ UAV - http://nongnu.org/paparazzi
     */
    'PPZ' = 9,
    /**
     * UAV Dev Board
     */
    'UDB' = 10,
    /**
     * FlexiPilot
     */
    'FP' = 11,
    /**
     * PX4 Autopilot - http://px4.io/
     */
    'PX4' = 12,
    /**
     * SMACCMPilot - http://smaccmpilot.org
     */
    'SMACCMPILOT' = 13,
    /**
     * AutoQuad -- http://autoquad.org
     */
    'AUTOQUAD' = 14,
    /**
     * Armazila -- http://armazila.com
     */
    'ARMAZILA' = 15,
    /**
     * Aerob -- http://aerob.ru
     */
    'AEROB' = 16,
    /**
     * ASLUAV autopilot -- http://www.asl.ethz.ch
     */
    'ASLUAV' = 17,
    /**
     * SmartAP Autopilot - http://sky-drones.com
     */
    'SMARTAP' = 18,
    /**
     * AirRails - http://uaventure.com
     */
    'AIRRAILS' = 19,
    /**
     * Fusion Reflex - https://fusion.engineering
     */
    'REFLEX' = 20
}
/**
 * MAVLINK component type reported in HEARTBEAT message. Flight controllers must report the type of the
 * vehicle on which they are mounted (e.g. MAV_TYPE_OCTOROTOR). All other components must report a
 * value appropriate for their type (e.g. a camera must use MAV_TYPE_CAMERA).
 */
export enum MavType {
    /**
     * Generic micro air vehicle
     */
    'GENERIC' = 0,
    /**
     * Fixed wing aircraft.
     */
    'FIXED_WING' = 1,
    /**
     * Quadrotor
     */
    'QUADROTOR' = 2,
    /**
     * Coaxial helicopter
     */
    'COAXIAL' = 3,
    /**
     * Normal helicopter with tail rotor.
     */
    'HELICOPTER' = 4,
    /**
     * Ground installation
     */
    'ANTENNA_TRACKER' = 5,
    /**
     * Operator control unit / ground control station
     */
    'GCS' = 6,
    /**
     * Airship, controlled
     */
    'AIRSHIP' = 7,
    /**
     * Free balloon, uncontrolled
     */
    'FREE_BALLOON' = 8,
    /**
     * Rocket
     */
    'ROCKET' = 9,
    /**
     * Ground rover
     */
    'GROUND_ROVER' = 10,
    /**
     * Surface vessel, boat, ship
     */
    'SURFACE_BOAT' = 11,
    /**
     * Submarine
     */
    'SUBMARINE' = 12,
    /**
     * Hexarotor
     */
    'HEXAROTOR' = 13,
    /**
     * Octorotor
     */
    'OCTOROTOR' = 14,
    /**
     * Tricopter
     */
    'TRICOPTER' = 15,
    /**
     * Flapping wing
     */
    'FLAPPING_WING' = 16,
    /**
     * Kite
     */
    'KITE' = 17,
    /**
     * Onboard companion controller
     */
    'ONBOARD_CONTROLLER' = 18,
    /**
     * Two-rotor Tailsitter VTOL that additionally uses control surfaces in vertical operation. Note, value
     * previously named MAV_TYPE_VTOL_DUOROTOR.
     */
    'VTOL_TAILSITTER_DUOROTOR' = 19,
    /**
     * Quad-rotor Tailsitter VTOL using a V-shaped quad config in vertical operation. Note: value
     * previously named MAV_TYPE_VTOL_QUADROTOR.
     */
    'VTOL_TAILSITTER_QUADROTOR' = 20,
    /**
     * Tiltrotor VTOL. Fuselage and wings stay (nominally) horizontal in all flight phases. It able to tilt
     * (some) rotors to provide thrust in cruise flight.
     */
    'VTOL_TILTROTOR' = 21,
    /**
     * VTOL with separate fixed rotors for hover and cruise flight. Fuselage and wings stay (nominally)
     * horizontal in all flight phases.
     */
    'VTOL_FIXEDROTOR' = 22,
    /**
     * Tailsitter VTOL. Fuselage and wings orientation changes depending on flight phase: vertical for
     * hover, horizontal for cruise. Use more specific VTOL MAV_TYPE_VTOL_TAILSITTER_DUOROTOR or
     * MAV_TYPE_VTOL_TAILSITTER_QUADROTOR if appropriate.
     */
    'VTOL_TAILSITTER' = 23,
    /**
     * Tiltwing VTOL. Fuselage stays horizontal in all flight phases. The whole wing, along with any
     * attached engine, can tilt between vertical and horizontal mode.
     */
    'VTOL_TILTWING' = 24,
    /**
     * VTOL reserved 5
     */
    'VTOL_RESERVED5' = 25,
    /**
     * Gimbal
     */
    'GIMBAL' = 26,
    /**
     * ADSB system
     */
    'ADSB' = 27,
    /**
     * Steerable, nonrigid airfoil
     */
    'PARAFOIL' = 28,
    /**
     * Dodecarotor
     */
    'DODECAROTOR' = 29,
    /**
     * Camera
     */
    'CAMERA' = 30,
    /**
     * Charging station
     */
    'CHARGING_STATION' = 31,
    /**
     * FLARM collision avoidance system
     */
    'FLARM' = 32,
    /**
     * Servo
     */
    'SERVO' = 33,
    /**
     * Open Drone ID. See https://mavlink.io/en/services/opendroneid.html.
     */
    'ODID' = 34,
    /**
     * Decarotor
     */
    'DECAROTOR' = 35,
    /**
     * Battery
     */
    'BATTERY' = 36,
    /**
     * Parachute
     */
    'PARACHUTE' = 37,
    /**
     * Log
     */
    'LOG' = 38,
    /**
     * OSD
     */
    'OSD' = 39,
    /**
     * IMU
     */
    'IMU' = 40,
    /**
     * GPS
     */
    'GPS' = 41,
    /**
     * Winch
     */
    'WINCH' = 42,
    /**
     * Generic multirotor that does not fit into a specific type or whose type is unknown
     */
    'GENERIC_MULTIROTOR' = 43
}
/**
 * These flags encode the MAV mode.
 */
export enum MavModeFlag {
    /**
     * 0b10000000 MAV safety set to armed. Motors are enabled / running / can start. Ready to fly.
     * Additional note: this flag is to be ignore when sent in the command MAV_CMD_DO_SET_MODE and
     * MAV_CMD_COMPONENT_ARM_DISARM shall be used instead. The flag can still be used to report the armed
     * state.
     */
    'SAFETY_ARMED' = 128,
    /**
     * 0b01000000 remote control input is enabled.
     */
    'MANUAL_INPUT_ENABLED' = 64,
    /**
     * 0b00100000 hardware in the loop simulation. All motors / actuators are blocked, but internal
     * software is full operational.
     */
    'HIL_ENABLED' = 32,
    /**
     * 0b00010000 system stabilizes electronically its attitude (and optionally position). It needs however
     * further control inputs to move around.
     */
    'STABILIZE_ENABLED' = 16,
    /**
     * 0b00001000 guided mode enabled, system flies waypoints / mission items.
     */
    'GUIDED_ENABLED' = 8,
    /**
     * 0b00000100 autonomous mode enabled, system finds its own goal positions. Guided flag can be set or
     * not, depends on the actual implementation.
     */
    'AUTO_ENABLED' = 4,
    /**
     * 0b00000010 system has a test mode enabled. This flag is intended for temporary system tests and
     * should not be used for stable implementations.
     */
    'TEST_ENABLED' = 2,
    /**
     * 0b00000001 Reserved for future use.
     */
    'CUSTOM_MODE_ENABLED' = 1
}
/**
 * These values encode the bit positions of the decode position. These values can be used to read the
 * value of a flag bit by combining the base_mode variable with AND with the flag position value. The
 * result will be either 0 or 1, depending on if the flag is set or not.
 */
export enum MavModeFlagDecodePosition {
    /**
     * First bit: 10000000
     */
    'SAFETY' = 128,
    /**
     * Second bit: 01000000
     */
    'MANUAL' = 64,
    /**
     * Third bit: 00100000
     */
    'HIL' = 32,
    /**
     * Fourth bit: 00010000
     */
    'STABILIZE' = 16,
    /**
     * Fifth bit: 00001000
     */
    'GUIDED' = 8,
    /**
     * Sixth bit: 00000100
     */
    'AUTO' = 4,
    /**
     * Seventh bit: 00000010
     */
    'TEST' = 2,
    /**
     * Eighth bit: 00000001
     */
    'CUSTOM_MODE' = 1
}
/**
 * MAV_STATE
 */
export enum MavState {
    /**
     * Uninitialized system, state is unknown.
     */
    'UNINIT' = 0,
    /**
     * System is booting up.
     */
    'BOOT' = 1,
    /**
     * System is calibrating and not flight-ready.
     */
    'CALIBRATING' = 2,
    /**
     * System is grounded and on standby. It can be launched any time.
     */
    'STANDBY' = 3,
    /**
     * System is active and might be already airborne. Motors are engaged.
     */
    'ACTIVE' = 4,
    /**
     * System is in a non-normal flight mode (failsafe). It can however still navigate.
     */
    'CRITICAL' = 5,
    /**
     * System is in a non-normal flight mode (failsafe). It lost control over parts or over the whole
     * airframe. It is in mayday and going down.
     */
    'EMERGENCY' = 6,
    /**
     * System just initialized its power-down sequence, will shut down now.
     */
    'POWEROFF' = 7,
    /**
     * System is terminating itself (failsafe or commanded).
     */
    'FLIGHT_TERMINATION' = 8
}
/**
 * Component ids (values) for the different types and instances of onboard hardware/software that might
 * make up a MAVLink system (autopilot, cameras, servos, GPS systems, avoidance systems etc.).
 * Components must use the appropriate ID in their source address when sending messages. Components can
 * also use IDs to determine if they are the intended recipient of an incoming message. The
 * MAV_COMP_ID_ALL value is used to indicate messages that must be processed by all components. When
 * creating new entries, components that can have multiple instances (e.g. cameras, servos etc.) should
 * be allocated sequential values. An appropriate number of values should be left free after these
 * components to allow the number of instances to be expanded.
 */
export enum MavComponent {
    /**
     * Target id (target_component) used to broadcast messages to all components of the receiving system.
     * Components should attempt to process messages with this component ID and forward to components on
     * any other interfaces. Note: This is not a valid *source* component id for a message.
     */
    'ALL' = 0,
    /**
     * System flight controller component ("autopilot"). Only one autopilot is expected in a particular
     * system.
     */
    'AUTOPILOT1' = 1,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER1' = 25,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER2' = 26,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER3' = 27,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER4' = 28,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER5' = 29,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER6' = 30,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER7' = 31,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER8' = 32,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER9' = 33,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER10' = 34,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER11' = 35,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER12' = 36,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER13' = 37,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER14' = 38,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER15' = 39,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER16' = 40,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER17' = 41,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER18' = 42,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER19' = 43,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER20' = 44,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER21' = 45,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER22' = 46,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER23' = 47,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER24' = 48,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER25' = 49,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER26' = 50,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER27' = 51,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER28' = 52,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER29' = 53,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER30' = 54,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER31' = 55,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER32' = 56,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER33' = 57,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER34' = 58,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER35' = 59,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER36' = 60,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER37' = 61,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER38' = 62,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER39' = 63,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER40' = 64,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER41' = 65,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER42' = 66,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER43' = 67,
    /**
     * Telemetry radio (e.g. SiK radio, or other component that emits RADIO_STATUS messages).
     */
    'TELEMETRY_RADIO' = 68,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER45' = 69,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER46' = 70,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER47' = 71,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER48' = 72,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER49' = 73,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER50' = 74,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER51' = 75,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER52' = 76,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER53' = 77,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER54' = 78,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER55' = 79,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER56' = 80,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER57' = 81,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER58' = 82,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER59' = 83,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER60' = 84,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER61' = 85,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER62' = 86,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER63' = 87,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER64' = 88,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER65' = 89,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER66' = 90,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER67' = 91,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER68' = 92,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER69' = 93,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER70' = 94,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER71' = 95,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER72' = 96,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER73' = 97,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER74' = 98,
    /**
     * Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be
     * published by components outside of the private network.
     */
    'USER75' = 99,
    /**
     * Camera #1.
     */
    'CAMERA' = 100,
    /**
     * Camera #2.
     */
    'CAMERA2' = 101,
    /**
     * Camera #3.
     */
    'CAMERA3' = 102,
    /**
     * Camera #4.
     */
    'CAMERA4' = 103,
    /**
     * Camera #5.
     */
    'CAMERA5' = 104,
    /**
     * Camera #6.
     */
    'CAMERA6' = 105,
    /**
     * Servo #1.
     */
    'SERVO1' = 140,
    /**
     * Servo #2.
     */
    'SERVO2' = 141,
    /**
     * Servo #3.
     */
    'SERVO3' = 142,
    /**
     * Servo #4.
     */
    'SERVO4' = 143,
    /**
     * Servo #5.
     */
    'SERVO5' = 144,
    /**
     * Servo #6.
     */
    'SERVO6' = 145,
    /**
     * Servo #7.
     */
    'SERVO7' = 146,
    /**
     * Servo #8.
     */
    'SERVO8' = 147,
    /**
     * Servo #9.
     */
    'SERVO9' = 148,
    /**
     * Servo #10.
     */
    'SERVO10' = 149,
    /**
     * Servo #11.
     */
    'SERVO11' = 150,
    /**
     * Servo #12.
     */
    'SERVO12' = 151,
    /**
     * Servo #13.
     */
    'SERVO13' = 152,
    /**
     * Servo #14.
     */
    'SERVO14' = 153,
    /**
     * Gimbal #1.
     */
    'GIMBAL' = 154,
    /**
     * Logging component.
     */
    'LOG' = 155,
    /**
     * Automatic Dependent Surveillance-Broadcast (ADS-B) component.
     */
    'ADSB' = 156,
    /**
     * On Screen Display (OSD) devices for video links.
     */
    'OSD' = 157,
    /**
     * Generic autopilot peripheral component ID. Meant for devices that do not implement the parameter
     * microservice.
     */
    'PERIPHERAL' = 158,
    /**
     * Gimbal ID for QX1.
     */
    'QX1_GIMBAL' = 159,
    /**
     * FLARM collision alert component.
     */
    'FLARM' = 160,
    /**
     * Parachute component.
     */
    'PARACHUTE' = 161,
    /**
     * Winch component.
     */
    'WINCH' = 169,
    /**
     * Gimbal #2.
     */
    'GIMBAL2' = 171,
    /**
     * Gimbal #3.
     */
    'GIMBAL3' = 172,
    /**
     * Gimbal #4
     */
    'GIMBAL4' = 173,
    /**
     * Gimbal #5.
     */
    'GIMBAL5' = 174,
    /**
     * Gimbal #6.
     */
    'GIMBAL6' = 175,
    /**
     * Battery #1.
     */
    'BATTERY' = 180,
    /**
     * Battery #2.
     */
    'BATTERY2' = 181,
    /**
     * CAN over MAVLink client.
     */
    'MAVCAN' = 189,
    /**
     * Component that can generate/supply a mission flight plan (e.g. GCS or developer API).
     */
    'MISSIONPLANNER' = 190,
    /**
     * Component that lives on the onboard computer (companion computer) and has some generic
     * functionalities, such as settings system parameters and monitoring the status of some processes that
     * don't directly speak mavlink and so on.
     */
    'ONBOARD_COMPUTER' = 191,
    /**
     * Component that lives on the onboard computer (companion computer) and has some generic
     * functionalities, such as settings system parameters and monitoring the status of some processes that
     * don't directly speak mavlink and so on.
     */
    'ONBOARD_COMPUTER2' = 192,
    /**
     * Component that lives on the onboard computer (companion computer) and has some generic
     * functionalities, such as settings system parameters and monitoring the status of some processes that
     * don't directly speak mavlink and so on.
     */
    'ONBOARD_COMPUTER3' = 193,
    /**
     * Component that lives on the onboard computer (companion computer) and has some generic
     * functionalities, such as settings system parameters and monitoring the status of some processes that
     * don't directly speak mavlink and so on.
     */
    'ONBOARD_COMPUTER4' = 194,
    /**
     * Component that finds an optimal path between points based on a certain constraint (e.g. minimum
     * snap, shortest path, cost, etc.).
     */
    'PATHPLANNER' = 195,
    /**
     * Component that plans a collision free path between two points.
     */
    'OBSTACLE_AVOIDANCE' = 196,
    /**
     * Component that provides position estimates using VIO techniques.
     */
    'VISUAL_INERTIAL_ODOMETRY' = 197,
    /**
     * Component that manages pairing of vehicle and GCS.
     */
    'PAIRING_MANAGER' = 198,
    /**
     * Inertial Measurement Unit (IMU) #1.
     */
    'IMU' = 200,
    /**
     * Inertial Measurement Unit (IMU) #2.
     */
    'IMU_2' = 201,
    /**
     * Inertial Measurement Unit (IMU) #3.
     */
    'IMU_3' = 202,
    /**
     * GPS #1.
     */
    'GPS' = 220,
    /**
     * GPS #2.
     */
    'GPS2' = 221,
    /**
     * Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet).
     */
    'ODID_TXRX_1' = 236,
    /**
     * Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet).
     */
    'ODID_TXRX_2' = 237,
    /**
     * Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet).
     */
    'ODID_TXRX_3' = 238,
    /**
     * Component to bridge MAVLink to UDP (i.e. from a UART).
     */
    'UDP_BRIDGE' = 240,
    /**
     * Component to bridge to UART (i.e. from UDP).
     */
    'UART_BRIDGE' = 241,
    /**
     * Component handling TUNNEL messages (e.g. vendor specific GUI of a component).
     */
    'TUNNEL_NODE' = 242,
    /**
     * Deprecated, don't use. Component for handling system messages (e.g. to ARM, takeoff, etc.).
     */
    'SYSTEM_CONTROL' = 250
}
/**
 * The heartbeat message shows that a system or component is present and responding. The type and
 * autopilot fields (along with the message component id), allow the receiving system to treat further
 * messages from this system appropriately (e.g. by laying out the user interface based on the
 * autopilot). This microservice is documented at https://mavlink.io/en/services/heartbeat.html
 */

