import { Inject, Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html?: string;
}

export abstract class Mailer {
  abstract enviar(correo: Correo): Promise<void>;
}

/** SMTP: Mailpit en desarrollo; en producción Gmail (587 + STARTTLS + clave de aplicación) u otro proveedor. */
@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transporte: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
    this.transporte = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      // En 587 (Gmail) exigir STARTTLS cuando hay credenciales: nunca enviar la clave en claro.
      requireTLS: !secure && !!env.SMTP_USER,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async enviar({ para, asunto, texto, html }: Correo) {
    await this.transporte.sendMail({
      from: this.env.MAIL_FROM,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
  }
}
