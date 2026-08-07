import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const videoMetadata = sqliteTable('videoMetadata', {
  mediaId: integer('mediaId').primaryKey(),
  duration: integer('duration').default(0),
  width: integer('width').default(0),
  height: integer('height').default(0),
  bitrate: integer('bitrate').default(0),
  fps: integer('fps').default(0),
  time: integer('time'),
  codec: text('codec'),
  title: text('title'),
  artist: text('artist'),
  album: text('album'),
})
