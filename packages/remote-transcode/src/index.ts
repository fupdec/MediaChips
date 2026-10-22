import path from 'path'
import {runFfmpeg, type ProcessingContext} from '../../processing-core/src'
/** Encode a bounded server-side playback derivative of a staged remote original. */
export async function transcodeRemote(context: ProcessingContext) {
  return runFfmpeg(context, ['-i', context.input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'], path.join(context.directory, 'playback.mp4'))
}
