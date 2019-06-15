#!/usr/bin/env node
const ytdl = require('ytdl-core')
const Libao = require('libao')
const signale = require('signale')
const url = require('url')
const ytpl = require('ytpl')
const deasync = require('deasync')
const ffmpeg = require('fluent-ffmpeg')
const mediakeys = require('mediakeys')
const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
const detectMediakeys = mediakeys.listen()

if (process.argv.length < 3) {
  signale.error('There\'s no enough args for working. Stopping.')
}

const playlist = []
let loop = false
let shuffle = false

// Thanks to https://stackoverflow.com/a/2450976
const getShuffled = (target) => {
  let currentIndex = target.length
  let temporaryValue
  let randomIndex

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex -= 1

    // And swap it with the current element.
    temporaryValue = target[currentIndex]
    target[currentIndex] = target[randomIndex]
    target[randomIndex] = temporaryValue
  }

  return target
}

let played = []
let volume = 0.5
let pipedF


const run = () => {
  signale.start('Mixing some datas randomly...')
  let playlistCopy = playlist.slice()
  if (shuffle) {
    playlistCopy = getShuffled(playlistCopy)
  }
  const play = async (unshift = false) => {
    if (unshift) {
      if (played.length !== 0) {
        playlistCopy.unshift(played.pop())
        if (played.length !== 0) {
          playlistCopy.unshift(played.pop())
        }
      }
    }
    const currentSong = playlistCopy.shift()
    if (typeof currentSong === 'undefined') {
      if (loop) {
        run()
      } else {
        return undefined
      }
    }

    const info = await ytdl.getInfo(currentSong)
    let paused = false
    played.push(currentSong)
    if (played.length > 10) {
      played = played.slice(0, 10)
    }
    signale.info(`Playing ${info.author.name} - ${info.title}`)
    const dl = ytdl(currentSong, { filter: 'audioonly', quality: 'highest' })
    const speaker = new Libao({
      channels: 2,
      bitDepth: 16,
      sampleRate: 44100
    })
    const configuredF = ffmpeg(dl).audioFilters(`volume=${volume}`).format('s16le').audioChannels(2).audioFrequency(44100)
    configuredF.pipe(speaker)
    const onNext = () => {
      pipedF.unpipe(speaker)
      speaker.close()
      configuredF.once('error', () => {})
      configuredF.kill()
      rl.off('line', onLine)
      detectMediakeys.off('next', onNext)
      detectMediakeys.off('back', onBack)
      detectMediakeys.off('play', onPlay)
      speaker.off('error', onError)
      speaker.off('pipe', onPipe)
      speaker.off('finish', onFinish)
      play()
    }
    const onBack = () => {
      pipedF.unpipe(speaker)
      speaker.close()
      configuredF.once('error', () => {})
      configuredF.kill()
      rl.off('line', onLine)
      detectMediakeys.off('next', onNext)
      detectMediakeys.off('back', onBack)
      detectMediakeys.off('play', onPlay)
      speaker.off('error', onError)
      speaker.off('pipe', onPipe)
      speaker.off('finish', onFinish)
      play(true)
    }
    const onPlay = () => {
      if (paused) {
        pipedF.resume()
        pipedF.pipe(speaker)
        paused = false
      } else {
        pipedF.unpipe(speaker)
        pipedF.pause()
        paused = true
      }
    }
    const onLine = input => {
      if (['play', 'p', 'pause'].includes(input.toLowerCase())) {
        if (paused) {
          pipedF.resume()
          pipedF.pipe(speaker)
          paused = false
        } else {
          pipedF.unpipe(speaker)
          pipedF.pause()
          paused = true
        }
      }
      if (['next', 'n'].includes(input.toLowerCase())) {
        pipedF.unpipe(speaker)
        speaker.close()
        configuredF.once('error', () => {})
        rl.off('line', onLine)
        detectMediakeys.off('next', onNext)
        detectMediakeys.off('back', onBack)
        detectMediakeys.off('play', onPlay)
        speaker.off('error', onError)
        speaker.off('pipe', onPipe)
        speaker.off('finish', onFinish)
        configuredF.kill()
        play()
      }
      if (['prev', 'p'].includes(input.toLowerCase())) {
        pipedF.unpipe(speaker)
        speaker.close()
        configuredF.once('error', () => {})
        rl.off('line', onLine)
        detectMediakeys.off('next', onNext)
        detectMediakeys.off('back', onBack)
        detectMediakeys.off('play', onPlay)
        speaker.off('error', onError)
        speaker.off('pipe', onPipe)
        speaker.off('finish', onFinish)
        configuredF.kill()
        play(true)
      }
      if (['exit', 'e'].includes(input.toLowerCase())) {
        process.exit()
      }
      if (input.toLowerCase().includes('v ')) {
        let parsedvolume = input.toLowerCase().replace('v ', '')
        parsedvolume = parseInt(parsedvolume)
        volume = parsedvolume / 100
        signale.log('Volume setted. It\'ll apply when the song is changed.')
      }
    }
    const onError = (err) => {
      if (err) {
        throw err
      }
    }
    const onPipe = src => {
      pipedF = src
    }
    const onFinish = () => {
      detectMediakeys.off('next', onNext)
      detectMediakeys.off('back', onBack)
      detectMediakeys.off('play', onPlay)
      rl.off('line', onLine)
      speaker.off('error', onError)
      speaker.off('pipe', onPipe)
      speaker.off('finish', onFinish)
      play()
    }
    speaker.on('error', onError)
    speaker.on('pipe', onPipe)
    speaker.on('finish', onFinish)
    rl.on('line', onLine)
    detectMediakeys.on('play', onPlay)
    detectMediakeys.once('next', onNext)
    detectMediakeys.once('back', onBack)
  }
  play()
}

const args = process.argv.slice(1, process.argv.length)
let done = 0
args.forEach(async arg => {
  const parsed = url.parse(arg)
  if (parsed.pathname === '/playlist') {
    signale.start('Getting videos from youtube playlist...')
    const result = await ytpl(arg, { limit: 10000 })
    result.items.forEach(item => {
      playlist.push(item.url)
    })
    done++
  } else if (arg === '--loop') {
    loop = true
    done++
  } else if (arg === '--shuffle') {
    shuffle = true
    done++
  } else {
    playlist.push(arg)
    done++
  }
})

deasync.loopWhile(() => {
  return done !== args.length
})

run()
