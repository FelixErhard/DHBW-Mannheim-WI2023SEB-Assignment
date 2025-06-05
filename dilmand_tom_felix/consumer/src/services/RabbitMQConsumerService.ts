import amqp from 'amqplib';
import { createRabbitMQChannel, rabbitMQConfig } from '../config/rabbitmq';
import { ILampDevice } from '../types/ILamp';
import { LampCommand } from '../types/LampCommandsType';
import { CommandStrategyFactory } from './CommandStrategyFactory';



export class RabbitMQConsumerService {
    private amqpChannel: amqp.Channel | null = null;
    private commandStrategyFactory: CommandStrategyFactory;
    private device: ILampDevice;

    constructor(device: ILampDevice) {
        this.commandStrategyFactory = new CommandStrategyFactory();
        this.device = device;
    }

    public async start(): Promise<void> {
        try {
            this.amqpChannel = await createRabbitMQChannel();
            
            // Exchange für Befehle deklarieren und binden
            await this.amqpChannel.assertExchange('lamp.commands.exchange', 'fanout', { durable: false });
            
            // Temporäre Queue für Befehle erstellen
            const { queue } = await this.amqpChannel.assertQueue('', { exclusive: true });
            
            // Queue an den Exchange binden
            await this.amqpChannel.bindQueue(queue, 'lamp.commands.exchange', '');
            
            console.log('[*] Waiting for messages on exchange: lamp.commands.exchange');

            this.amqpChannel.consume(queue, async (msg: any) => {
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
                });
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
        try {
            if (cmd.command === "morse") {
                // Annahme: value ist in diesem Fall ein String
                await this.device.playMorse((cmd as any).value);
            } else {
                const strategy = this.commandStrategyFactory.getStrategy(cmd.command);
                if (!strategy) {
                    throw new Error(`Unsupported command: ${cmd.command}`);
                }
                console.log(`Executing command strategy for: ${cmd.command}`);
                await strategy.execute(this.device, cmd);
            }

            const currentState = await this.device.getCurrentState();
            if (this.amqpChannel) {
                const statusQueueName = rabbitMQConfig.lampStatusQueue;
                const statusMessage = JSON.stringify(currentState);
                await this.amqpChannel.sendToQueue(statusQueueName, Buffer.from(statusMessage));
                console.log("Sent current state to status queue:", statusMessage);
            }
            console.log("Current state:", currentState);
        } catch (error) {
            console.error(`Error processing lamp command ${cmd.command}:`, error);
            throw error;
        }
    }

}
