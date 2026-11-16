import { createRequire } from 'node:module';
export function airplayLibrary(){return createRequire(__filename)('@sonn-audio/node-airplay') as typeof import('@sonn-audio/node-airplay');}
