import { TapoDeviceInfo } from "tplink-bulbs/dist/types";
import { ILampDevice, ILampState } from "../types/ILamp";

// Diese Klasse simuliert eine smarte Lampe
// und speichert den aktuellen Zustand lokal.
export class MockLampDevice implements ILampDevice {
async getDeviceInfo(): Promise<TapoDeviceInfo> {
    // Mock implementation of device info
    console.log("MockDevice: Device info requested");
    const mockDeviceInfo: TapoDeviceInfo = {
        device_id: "mock-device-id",


        model: "MockModel",


        mac: "00:00:00:00:00:00",
        ip: "192.168.0.100",
        ssid: "MockSSID",

        rssi: -30,
        fw_ver: "",
        hw_ver: "",
        type: "",
        hw_id: "",
        fw_id: "",
        oem_id: "",
        specs: "",
        device_on: false,
        on_time: 0,
        overheated: false,
        nickname: "",
        location: "",
        avatar: "",
        time_usage_today: "",
        time_usage_past7: "",
        time_usage_past30: "",
        longitude: "",
        latitude: "",
        has_set_location_info: false,
        signal_level: 0,
        region: "",
        time_diff: 0,
        lang: ""
    };
    return Promise.resolve(mockDeviceInfo);
}
  private state: ILampState = {
    poweredOn: false,
    brightness: 100,
    color: "white",
  };

  // Schaltet die Lampe ein
  async turnOn() {
    console.log("MockDevice: ON");
    this.state.poweredOn = true;
  }

  // Schaltet die Lampe aus
  async turnOff() {
    console.log("MockDevice: OFF");
    this.state.poweredOn = false;
  }

  // Setzt die Helligkeit (0–100)
  async setBrightness(brightnessLevel?: number) {
    const value = brightnessLevel ?? 100; // Default to 100 if undefined
    console.log(`MockDevice: Brightness ${value}`);
    this.state.brightness = value;
  }

  // Setzt die Farbe (z. B. "red", "#ff0000")
  async setColour(colour?: string) {
    const value = colour ?? "white"; // Default to "white" if undefined
    console.log(`MockDevice: Color ${value}`);
    this.state.color = value;
  }

  // Gibt den aktuellen Zustand der Lampe zurück
  async getCurrentState() {
    return Promise.resolve(this.state);
  }
}