import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom, timer } from 'rxjs';

@Injectable()
export class AppService {
  private logger = new Logger(AppService.name);

  async businessLogic<T>(payload: T) {
    this.logger.log(`Business logic started for ${payload}.`);

    await firstValueFrom(timer(40000));

    this.logger.log(`Business logic completed for ${payload}.`);
  }
}
