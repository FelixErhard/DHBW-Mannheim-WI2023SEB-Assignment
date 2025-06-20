import * as TPLink from 'tplink-bulbs';
import { TapoDeviceInfo } from 'tplink-bulbs/dist/types';
export interface ILampState {
    poweredOn: boolean;
    brightness: number;
    color: string;
};
export interface ILampDevice {
    turnOn(): Promise<void>;
    turnOff(): Promise<void>;
    setBrightness(value: number): Promise<void>;
    setColour(color: string): Promise<void>; // Beachte britische Schreibweise in deinem Original
    getCurrentState(): Promise<ILampState>; // Nützlich für Synchronisation
    getDeviceInfo(): Promise<TapoDeviceInfo>; // Füge diese Methode hinzu, um Gerätedaten zu erhalten
}
