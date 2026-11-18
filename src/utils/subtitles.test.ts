import {describe, expect, it} from 'vitest'
import {cueTextToHtml, findActiveCues, parseSubtitleTimestamp, parseSubtitles} from './subtitles'

describe('subtitles parser', () => {
  it('parses SRT and WebVTT timestamps', () => {
    expect(parseSubtitleTimestamp('00:01:02,500')).toBe(62.5)
    expect(parseSubtitleTimestamp('01:02.5')).toBe(62.5)
    expect(parseSubtitleTimestamp('1:00:00.000')).toBe(3600)
    expect(parseSubtitleTimestamp('nonsense')).toBeNull()
    expect(parseSubtitleTimestamp('00:61:00,000')).toBeNull()
  })

  it('parses an SRT file with CRLF and a BOM', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nthere\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n<i>Bye</i>\r\n'
    expect(parseSubtitles(srt)).toEqual([
      {start: 1, end: 2.5, text: 'Hello\nthere'},
      {start: 3, end: 4, text: '<i>Bye</i>'},
    ])
  })

  it('parses WebVTT and skips header, notes and cue settings', () => {
    const vtt = 'WEBVTT - title\n\nNOTE a comment\n\nintro\n00:01.000 --> 00:02.000 align:start\nFirst\n\n00:03.000 --> 00:04.000\nSecond\n'
    expect(parseSubtitles(vtt)).toEqual([
      {start: 1, end: 2, text: 'First'},
      {start: 3, end: 4, text: 'Second'},
    ])
  })

  it('drops broken, empty and backwards cues and sorts the rest', () => {
    const srt = '1\n00:00:05,000 --> 00:00:06,000\nLate\n\n2\n00:00:03,000 --> 00:00:02,000\nBackwards\n\n3\n00:00:01,000 --> 00:00:02,000\n\n\n4\n00:00:01,000 --> 00:00:02,000\nEarly\n'
    expect(parseSubtitles(srt).map(cue => cue.text)).toEqual(['Early', 'Late'])
  })
})

describe('findActiveCues', () => {
  const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:05,000\nLong\n\n2\n00:00:02,000 --> 00:00:03,000\nShort\n\n3\n00:00:10,000 --> 00:00:11,000\nLater\n')

  it('finds cues covering the time, including overlapping ones', () => {
    expect(findActiveCues(cues, 0.5)).toEqual([])
    expect(findActiveCues(cues, 2.5).map(cue => cue.text)).toEqual(['Long', 'Short'])
    expect(findActiveCues(cues, 4).map(cue => cue.text)).toEqual(['Long'])
    expect(findActiveCues(cues, 5)).toEqual([])
    expect(findActiveCues(cues, 10.5).map(cue => cue.text)).toEqual(['Later'])
    expect(findActiveCues([], 1)).toEqual([])
  })
})

describe('cueTextToHtml', () => {
  it('keeps basic formatting and line breaks only', () => {
    expect(cueTextToHtml('<i>Hi</i>\n<b>there</b>')).toBe('<i>Hi</i><br><b>there</b>')
    expect(cueTextToHtml('<font color="red">Red</font> {\\an8}top')).toBe('Red top')
    expect(cueTextToHtml('<v Bob>Hi<00:00:01.000> you')).toBe('Hi you')
  })

  it('escapes anything that could become markup', () => {
    expect(cueTextToHtml('2 < 3 & 5 > 4')).toBe('2 &lt; 3 &amp; 5 &gt; 4')
    expect(cueTextToHtml('<img src=x onerror=alert(1)>')).toBe('')
    expect(cueTextToHtml('<script>alert(1)</script>')).toBe('alert(1)')
    expect(cueTextToHtml('<I>Up</I>')).toBe('<i>Up</i>')
  })
})
