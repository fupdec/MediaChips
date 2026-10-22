import path from 'path'
import {runFfmpeg, type ProcessingContext} from '../../processing-core/src'
/** Twelve thumbnails over the first requested interval; one JPEG output. */
export async function createBackgroundStoryboard(context: ProcessingContext, intervalSeconds = 10) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 3600) throw new Error('invalid_storyboard_interval')
  return runFfmpeg(context, ['-i', context.input, '-an', '-vf', `fps=1/${intervalSeconds},scale=320:-2,tile=4x3`, '-frames:v', '1', '-q:v', '3'], path.join(context.directory, 'storyboard.jpg'))
}
