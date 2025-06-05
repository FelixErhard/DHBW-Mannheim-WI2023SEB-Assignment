import amqp from 'amqplib';
import dotenv from "dotenv";
import { rabbitMQConfig, createRabbitMQChannel, closeRabbitMQConnection } from '../config/rabbitmq';

dotenv.config();

// Lampenbefehlstypen
interface LampCommand {
  command: 'on' | 'off' | 'brightness' | 'color' | 'morse' | 'getStatus';
  value?: number | string;
}

export class RabbitMQProducerService {
  private channel: amqp.Channel | null = null;
  private readonly exchangeName: string = 'lamp.commands.exchange';

  constructor() {}

  public isConnected(): boolean {
    return !!this.channel;
  }

  public async connect(): Promise<void> {
    try {
      console.log('Verbindung zu RabbitMQ wird hergestellt...');
      const result = await createRabbitMQChannel();
      this.channel = result;
      
      // Exchange für Befehle erstellen
      if (this.channel) {
        await this.channel.assertExchange(this.exchangeName, 'fanout', { durable: false });
        console.log('RabbitMQ-Verbindung hergestellt und Exchange erstellt');
      }
    } catch (error) {
      console.error("Error connecting to RabbitMQ:", error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      console.log('RabbitMQ-Verbindung wird geschlossen...');
      await closeRabbitMQConnection();
      this.channel = null;
      console.log('RabbitMQ-Verbindung geschlossen');
    } catch (error: any) {
      console.error('Fehler beim Schließen der RabbitMQ-Verbindung:', error);
      throw error;
    }
  }

  private async sendCommand(command: LampCommand): Promise<void> {
    if (!this.channel) {
      console.log("Channel nicht bereit, versuche erneut zu verbinden");
      await this.connect();
      if (!this.channel) {
        throw new Error("Konnte keine Verbindung zu RabbitMQ herstellen");
      }
    }

    try {
      const msgBuffer = Buffer.from(JSON.stringify(command));
      
      // Sende zum Exchange, nicht zur Queue
      if (this.channel) {
        await this.channel.publish(this.exchangeName, '', msgBuffer, {
          persistent: false,
          contentType: "application/json",
        });
        
        console.log("[x] Gesendet:", command);
      }
    } catch (error) {
      console.error("Fehler beim Senden des Befehls:", error);
      throw error;
    }
  }

  public async turnOn(): Promise<void> {
    return this.sendCommand({ command: "on" });
  }

  public async turnOff(): Promise<void> {
    return this.sendCommand({ command: "off" });
  }

  public async setBrightness(value: number): Promise<void> {
    return this.sendCommand({ command: "brightness", value });
  }

  public async setColor(color: string): Promise<void> {
    return this.sendCommand({ command: "color", value: color });
  }

  public async sendMorseMessage(message: string): Promise<void> {
    return this.sendCommand({ command: "morse", value: message });
  }
  
  public async requestStatus(): Promise<void> {
    return this.sendCommand({ command: "getStatus" });
  }
}

export const rabbitMQService = new RabbitMQProducerService();