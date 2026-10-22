import path from 'path'
import {runFfmpeg, type ProcessingContext} from '../../processing-core/src'
export async function extractFrame(context: ProcessingContext, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) throw new Error('invalid_frame_time')
  return runFfmpeg(context, ['-ss', String(seconds), '-i', context.input, '-an', '-vf', "scale='min(1280,iw)':-2", '-frames:v', '1', '-q:v', '2'], path.join(context.directory, 'frame.jpg'))
}
