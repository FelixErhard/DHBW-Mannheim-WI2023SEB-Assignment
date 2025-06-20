import amqp from 'amqplib';
import { createRabbitMQChannel, publishLampStatus, rabbitMQConfig } from '../config/rabbitmq';
import { ILampDevice, } from '../types/ILamp';
import { LampCommand } from '../types/LampCommandsType';
import { CommandStrategyFactory } from './CommandStrategyFactory';
import { createTplinkDeviceConnection } from '../config/tplink';
import { MockLampDevice } from '../config/mockLamp';



export class RabbitMQConsumerService {
    private amqpChannel: amqp.Channel | null = null;
    private commandStrategyFactory: CommandStrategyFactory;
    private device: ILampDevice;
    private mockDevice: MockLampDevice;

    constructor(device: ILampDevice) {
        this.commandStrategyFactory = new CommandStrategyFactory();
        this.device = device;
        this.mockDevice = new MockLampDevice();
    }

    public async start(): Promise<void> {
        try {
            this.amqpChannel = await createRabbitMQChannel();
            const queueName = rabbitMQConfig.lampCommandQueue;
            console.log('[*] Waiting for messages in:', queueName);

            this.amqpChannel.consume(queueName, async (msg: any) => {
                if (msg !== null && this.amqpChannel) {
                    const rawValue = msg.content.toString();
                    let commandPayload: LampCommand;

                    try {
                        const parsedJson = JSON.parse(rawValue);
                        commandPayload = parsedJson as LampCommand;
                        console.log("Parsed command:", commandPayload);

                        await this.handleCommand(commandPayload);
                        this.amqpChannel.ack(msg);
                    } catch (error: any) {
                        console.error('Error processing message or invalid command structure:', rawValue, error);
                    }
                }
            }, { noAck: false });
        } catch (error) {
            console.error('Error starting lamp command consumer:', error);
            if (this.amqpChannel) {
                this.amqpChannel.close().catch(err => {
                    console.error('Error closing AMQP channel:', err);
                }
                );
            }
        }
    }

    public async stop(): Promise<void> {
        if (this.amqpChannel) {
            await this.amqpChannel.close().catch(err => {
                console.error('Error closing AMQP channel:', err);
            });
            console.log("Attempting to close lamp consumer channel.");
        }
    }

    public async handleCommand(cmd: LampCommand): Promise<void> {
        console.log(`Handling command: ${cmd.command}`, cmd);

        // Vorbereiten des erwarteten Zustands basierend auf dem Befehl
        const expectedState = await this.getExpectedState(cmd);

        // Dynamisch Device wählen: Echte Lampe oder Mock
        let deviceToUse = this.device;
        let isMock = false;
        try {
            deviceToUse = await createTplinkDeviceConnection();
        } catch (err) {
            console.warn("Echte Lampe nicht erreichbar, benutze MockDevice.");
            deviceToUse = this.mockDevice;
            isMock = true;
        }

        try {
            // Ausführen des Befehls mit Timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout bei der Verbindung zum physischen Gerät')), 5000);
            });

            const strategy = this.commandStrategyFactory.getStrategy(cmd.command);
            if (!strategy) {
                throw new Error(`Unsupported command: ${cmd.command}`);
            }

            // Race zwischen eigentlicher Ausführung und Timeout
            await Promise.race([
                strategy.execute(deviceToUse, cmd, this.amqpChannel!),
                timeoutPromise
            ]);

            // Bei erfolgreicher Ausführung, aktuellen Zustand veröffentlichen
            const currentState = await deviceToUse.getCurrentState();
            const statusWithMockInfo = { ...currentState, isMockDevice: isMock };
            await publishLampStatus(statusWithMockInfo, this.amqpChannel!);
        } catch (error: any) {
            console.error(`Error processing lamp command ${cmd.command}:`, error);

            // Bei Fehler/Timeout den erwarteten Zustand mit Fehlermeldung veröffentlichen
            if (this.amqpChannel) {
                const errorState = {
                    ...expectedState,
                    error: {
                        message: error.message || 'Unbekannter Fehler bei der Lampensteuerung',
                        command: cmd.command
                    }
                };

                await publishLampStatus(errorState, this.amqpChannel).catch(err => {
                    console.error('Error publishing error status:', err);
                });
            }
        }
    }

    // Hilfsmethode zur Bestimmung des erwarteten Zustands
    private async getExpectedState(cmd: LampCommand): Promise<any> {
        // Default-Werte, falls das Gerät nicht erreichbar ist
        let baseState = {
            poweredOn: false,
            brightness: 100,
            color: "#ffffff"
        };

        // Versuche aktuellen Zustand zu holen, aber ignoriere Fehler
        try {
            baseState = await this.device.getCurrentState();
        } catch {
            // Gerät nicht erreichbar, Default-Werte bleiben erhalten
        }

        // Leite den erwarteten Zustand nur aus dem Befehl ab
        switch (cmd.command) {
            case 'on':
                return { ...baseState, poweredOn: true };
            case 'off':
                return { ...baseState, poweredOn: false };
            case 'brightness':
                return { ...baseState, brightness: (cmd as any).value };
            case 'color':
                return { ...baseState, color: (cmd as any).value };
            case 'morse':
                // Morse ändert den Zustand nicht dauerhaft
                return baseState;
            default:
                return baseState;
        }
    }

}
