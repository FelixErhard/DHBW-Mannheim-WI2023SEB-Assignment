import { RabbitMQConsumerService } from './services/RabbitMQConsumerService';
import { closeRabbitMQConnection } from './config/rabbitmq';
import { MockLampDevice } from './config/mockLampDevice';

import express from 'express';      // REST-API für Statusausgabe
import cors from 'cors';            // Für Cross-Origin-Anfragen vom Frontend
import amqp from 'amqplib';         // RabbitMQ-Client

async function main() {
    try {
        console.log("Consumer wird gestartet...");
        
        // Simuliertes Lampengerät erzeugen
        const mockDevice = new MockLampDevice();
        console.log("Lampengerät initialisiert");

        // RabbitMQ-Verbindung für Status-Events erstellen
        console.log("Verbinde mit RabbitMQ für Status-Events...");
        const statusConnection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
        const statusChannel = await statusConnection.createChannel();
        console.log("RabbitMQ-Verbindung für Status-Events hergestellt");
        
        // Exchange für Status-Events erstellen
        await statusChannel.assertExchange('lamp.status.exchange', 'fanout', { durable: false });
        await statusChannel.assertExchange('lamp.morse.exchange', 'fanout', { durable: false });
        console.log("Status-Exchanges erstellt");
        
        // Funktion zum Veröffentlichen des Status
        const publishStatus = async () => {
            const state = await mockDevice.getCurrentState();
            console.log('Status wird veröffentlicht:', state);
            statusChannel.publish(
                'lamp.status.exchange',
                '',
                Buffer.from(JSON.stringify(state))
            );
        };
        
        // Funktion für Morse-Fortschritt
        const publishMorseProgress = (status: string, progress?: number) => {
            const data: any = { status };
            if (progress !== undefined) {
                data.progress = progress;
            }
            
            console.log('Morse-Status wird veröffentlicht:', data);
            statusChannel.publish(
                'lamp.morse.exchange',
                '',
                Buffer.from(JSON.stringify(data))
            );
        };
        
        // Ursprüngliche Methoden speichern und überschreiben
        const originalTurnOn = mockDevice.turnOn;
        mockDevice.turnOn = async function() {
            await originalTurnOn.call(this);
            await publishStatus();
        };
        
        const originalTurnOff = mockDevice.turnOff;
        mockDevice.turnOff = async function() {
            await originalTurnOff.call(this);
            await publishStatus();
        };
        
        const originalSetBrightness = mockDevice.setBrightness;
        mockDevice.setBrightness = async function(value) {
            await originalSetBrightness.call(this, value);
            await publishStatus();
        };
        
        const originalSetColour = mockDevice.setColour;
        mockDevice.setColour = async function(color) {
            await originalSetColour.call(this, color);
            await publishStatus();
        };
        
        // Morse-Methode erweitern
        const originalPlayMorse = mockDevice.playMorse;
        if (originalPlayMorse) {
            mockDevice.playMorse = async function(text) {
                publishMorseProgress('started');
                
                // Morse-Code-Map
                const morseMap: Record<string, string> = {
                    a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.",
                    h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.",
                    o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-",
                    u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
                    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
                    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
                    " ": "/"
                };
                
                // Text in Morse-Code umwandeln
                const morse = text.toLowerCase().split("").map(c => morseMap[c] || "").join(" ");
                console.log(`Morse für "${text}": ${morse}`);
                
                // Gesamtanzahl der Zeichen für Fortschrittsberechnung
                const totalChars = morse.length;
                let processedChars = 0;
                
                // Flash-Methode zwischenspeichern und ersetzen
                const originalFlash = this.flash;
                if (originalFlash) {
                    this.flash = async (duration) => {
                        await originalFlash.call(this, duration);
                        processedChars++;
                        
                        if (processedChars % Math.max(1, Math.floor(totalChars / 10)) === 0 || processedChars === totalChars) {
                            const progress = Math.round((processedChars / totalChars) * 100);
                            publishMorseProgress('progress', progress);
                        }
                    };
                }
                
                try {
                    // Original-Morse-Methode aufrufen oder selbst implementieren
                    if (originalPlayMorse) {
                        await originalPlayMorse.call(this, text);
                    } else {
                        // Fallback, falls originalPlayMorse nicht vorhanden
                        for (const char of morse) {
                            if (char === ".") {
                                await this.turnOn();
                                await new Promise(resolve => setTimeout(resolve, 100));
                                await this.turnOff();
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } else if (char === "-") {
                                await this.turnOn();
                                await new Promise(resolve => setTimeout(resolve, 300));
                                await this.turnOff();
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } else if (char === "/") {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else if (char === " ") {
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                            
                            processedChars++;
                            if (processedChars % Math.max(1, Math.floor(totalChars / 10)) === 0) {
                                const progress = Math.round((processedChars / totalChars) * 100);
                                publishMorseProgress('progress', progress);
                            }
                        }
                    }
                    
                    // Morse abgeschlossen
                    publishMorseProgress('completed');
                    
                    // Status nach Morse-Abschluss veröffentlichen
                    await publishStatus();
                } finally {
                    // Original-Flash-Methode wiederherstellen
                    if (originalFlash) {
                        this.flash = originalFlash;
                    }
                }
            };
        }

        // Consumer initialisieren, der auf Nachrichten von RabbitMQ hört
        console.log("Initialisiere Consumer...");
        const consumer = new RabbitMQConsumerService(mockDevice);
        
        // handleCommand-Methode erweitern
        const originalHandleCommand = consumer.handleCommand;
        consumer.handleCommand = async function(cmd) {
            console.log('Verarbeite Kommando:', cmd);
            
            if (cmd.command === 'getStatus') {
                console.log('Status-Anfrage empfangen, veröffentliche Status');
                await publishStatus();
                return;
            }
            
            if (cmd.command === 'morse' && cmd.value) {
                console.log('Morse-Anfrage empfangen:', cmd.value);
                await mockDevice.playMorse(cmd.value);
                return;
            }
            
            // Originalmethode für andere Kommandos aufrufen
            await originalHandleCommand.call(this, cmd);
        };
        
        console.log("Consumer wird gestartet...");
        await consumer.start();
        console.log("Consumer erfolgreich gestartet");
        
        // Initialen Status veröffentlichen
        await publishStatus();
        console.log("Initialer Status veröffentlicht");

        // Express-Server zur Statusabfrage starten (für Diagnose und Kompatibilität)
        const app = express();
        const port = 4000;

        // CORS aktivieren
        app.use(cors());

        // Endpunkt zur Abfrage des aktuellen Lampenzustands
        app.get('/lamp/status', async (req, res) => {
            try {
                const state = await mockDevice.getCurrentState();
                res.json(state);
            } catch (err) {
                console.error("Fehler beim Lesen des Lampenzustands:", err);
                res.status(500).json({ error: "Zustand konnte nicht gelesen werden" });
            }
        });
        
        // REST-API starten
        app.listen(port, () => {
            console.log(`Lamp status API läuft auf Port ${port}`);
        });

        // Bei Strg+C sauber beenden
        process.on('SIGINT', async () => {
            console.log("Shutting down...");
            await consumer.stop();
            await statusChannel.close();
            await statusConnection.close();
            await closeRabbitMQConnection();
            process.exit(0);
        });
    } catch (error) {
        console.error("Fehler beim Starten des Consumers:", error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error("Unbehandelter Fehler:", err);
    process.exit(1);
});