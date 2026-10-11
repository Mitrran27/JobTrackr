import { Module } from '@nestjs/common';
import { ExtractorService } from './extractor.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MatcherService } from './matcher.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, ExtractorService, MatcherService],
})
export class JobsModule {}
