// Alle erlaubten Befehle – jetzt inkl. "morse"
export type LampCommandType = 'on' | 'off' | 'brightness' | 'color' | 'morse' | 'getStatus';

// Basistyp für jeden Befehl
export interface LampCommandBase {
    command: LampCommandType;
}

// Ein-/Ausschalten
export interface TurnOnCommand extends LampCommandBase {
    command: 'on';
}

export interface TurnOffCommand extends LampCommandBase {
    command: 'off';
}

// Helligkeit setzen
export interface SetBrightnessCommand extends LampCommandBase {
    command: 'brightness';
    value: number;
}

// Farbe setzen
export interface SetColorCommand extends LampCommandBase {
    command: 'color';
    value: string;
}

// 🆕 Morse-Nachricht senden
export interface SendMorseCommand extends LampCommandBase {
    command: 'morse';
    value: string;
}
export interface GetStatusCommand extends LampCommandBase {
    command: 'getStatus';
    // Kein Wert erforderlich, da es nur den Status abfragt
}

// Union-Typ aller erlaubten Befehle
export type LampCommand =
    | TurnOnCommand
    | TurnOffCommand
    | SetBrightnessCommand
    | SetColorCommand
    | SendMorseCommand
    | GetStatusCommand;

