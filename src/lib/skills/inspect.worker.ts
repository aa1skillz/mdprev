/// <reference lib="webworker" />
import { serve } from '../rpc';
import { inspectCollection } from './inspect';
import type { Vfs } from './types';

self.onmessage = serve((vfs: Vfs) => inspectCollection(vfs));
