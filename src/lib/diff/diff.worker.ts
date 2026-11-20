/// <reference lib="webworker" />
import { serve } from '../rpc';
import { diffBlocks, splitLines } from './engine';
import type { DiffReq } from './client';

self.onmessage = serve((r: DiffReq) => diffBlocks(splitLines(r.a), splitLines(r.b), r.o));
