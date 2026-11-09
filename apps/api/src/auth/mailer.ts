import { Inject, Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
}

export abstract class Mailer {
  abstract enviar(correo: Correo): Promise<void>;
}

/** SMTP (Mailpit en desarrollo). El proveedor de producción se define en §16. */
@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transporte: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transporte = createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false });
  }

  async enviar({ para, asunto, texto }: Correo) {
    await this.transporte.sendMail({
      from: this.env.MAIL_FROM,
      to: para,
      subject: asunto,
      text: texto,
    });
  }
}
