import { Global, Injectable, Module } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from './config';
@Injectable()
export class Mailer {
  async send(to: string, subject: string, text: string, id?: string) {
    if (config.MAIL_DRIVER === 'file') {
      await mkdir(config.MAIL_DIRECTORY, { recursive: true });
      await writeFile(
        join(config.MAIL_DIRECTORY, `${id ?? randomUUID()}.json`),
        JSON.stringify({ to, subject, text }, null, 2),
      );
      return;
    }
    const transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === 'true',
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: config.MAIL_FROM,
      to,
      subject,
      text,
      messageId: id ? `<${id}@warrantyvault>` : undefined,
    });
  }
}
@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {}
