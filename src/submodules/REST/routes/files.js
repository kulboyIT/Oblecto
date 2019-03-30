import sequelize from 'sequelize';
import fs from 'fs';
import ffmpeg from '../../../submodules/ffmpeg';

import databases from '../../../submodules/database';
import authMiddleWare from '../middleware/auth';
import config from '../../../config';


export default (server) => {
    // Endpoint to send video files to the client
    server.get('/stream/:id', async function (req, res, next) {
        // search for attributes
        let fileInfo = await databases.file.findById(req.params.id);

        req.video = {};

        req.video.path = fileInfo.path;
        req.video.fileInfo = fileInfo;
        req.video.size = fs.statSync(req.video.path).size;

        let mime = 'video';

        let mimes = {
            'mp4': 'video/mp4',
            'mkv': 'video/x-matroska',
            'avi': 'video/avi',
        };

        if (mimes[fileInfo.extension])
            req.video.mime = mimes[fileInfo.extension];

        // Transcode
        if (config.transcoding.doRealTime && fileInfo.extension !== 'mp4')
            return next();

        if (req.headers.range) { // meaning client (browser) has moved the forward/back slider
            // which has sent this request back to this server logic ... cool
            var range = req.headers.range;
            var parts = range.replace(/bytes=/, '').split('-');
            var partialstart = parts[0];
            var partialend = parts[1];

            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : req.video.size  - 1;
            var chunksize = (end - start) + 1;
            console.log('RANGE: ' + start + ' - ' + end + ' = ' + chunksize);

            var file = fs.createReadStream(req.video.path , {
                start: start,
                end: end
            });

            res.writeHead(206, {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + req.video.size,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': req.video.mime
            });

            file.pipe(res);

        } else {

            console.log('ALL: ' + req.video.size);

            res.writeHead(200, {
                'Content-Length': req.video.size,
                'Accept-Ranges': 'bytes',
                'Content-Type': req.video.mime
            });

            fs.createReadStream(req.video.path).pipe(res);
        }

    }, async function (req, res, next) {
        // TODO: Determine whether or not to remux or transcode depending on video encoding
        res.writeHead(200, {
            'Content-Type': 'video/mp4'
        });

        ffmpeg(req.video.path)
            .native()
            .format('mp4')
            .videoCodec('copy')
            .audioCodec('libmp3lame')
            .outputOptions([
                '-movflags', 'empty_moov',
            ])


            // setup event handlers

            // save to stream
            .on("start", (cmd)=>{
                console.log("--- ffmpeg start process ---")
                console.log(`cmd: ${cmd}`)
            })
            .on("end",()=>{
                console.log("--- end processing ---")
            })
            .on("error", (err)=>{
                console.log("--- ffmpeg meets error ---")
                console.log(err)
            })
            .pipe(res, {end:true});
    });


    server.get('/stream/:id/:seek',  async function (req, res, next) {
        // TODO: Determine whether or not to remux or transcode depending on video encoding

        let fileInfo = await databases.file.findById(req.params.id);

        req.video = {};

        req.video.path = fileInfo.path;

        res.writeHead(200, {
            'Content-Type': 'video/mp4'
        });

        ffmpeg(req.video.path)
            .native()
            .format('mp4')
            .videoCodec('copy')
            //.audioBitrate('128k')
            //.videoBitrate(500)
            .seekInput(req.params.seek)
            .audioCodec('libmp3lame')
            .outputOptions([
                '-movflags', `empty_moov`,
            ])


            // setup event handlers

            // save to stream
            .on("start", (cmd)=>{
                console.log("--- ffmpeg start process ---")
                console.log(`cmd: ${cmd}`)
            })
            .on("end",()=>{
                console.log("--- end processing ---")
            })
            .on("error", (err)=>{
                console.log("--- ffmpeg meets error ---")
                console.log(err)
            })
            .pipe(res, {end:true});
    });

    server.get('/HLS/:id/segment/:segment',  async function (req, res, next) {
        // TODO: Determine whether or not to remux or transcode depending on video encoding

        let segmentLength = 10 // Segment length in seconds

        let fileInfo = await databases.file.findById(req.params.id);

        req.video = {};

        req.video.path = fileInfo.path;

        res.writeHead(200, {
            'Content-Type': 'video/MP2T'
        });

        ffmpeg(req.video.path)
            .format('hls')
            .videoCodec('copy')
            //.audioBitrate('128k')
            //.videoBitrate(500)
            .seekInput(req.params.segment * segmentLength)
            //.duration(segmentLength)
            .audioCodec('libmp3lame')
            .outputOptions([
                '-segment_time', segmentLength,
                '-copyts'
            ])


            // setup event handlers

            // save to stream
            .on("start", (cmd)=>{
                console.log("--- ffmpeg start process ---")
                console.log(`cmd: ${cmd}`)
            })
            .on("end",()=>{
                console.log("--- end processing ---")
            })
            .on("error", (err)=>{
                console.log("--- ffmpeg meets error ---")
                console.log(err)
            })
            .pipe(res, {end:true});
    });

    server.get('/HLS/:id/playlist',  async function (req, res, next) {
        // TODO: Determine whether or not to remux or transcode depending on video encoding

        res.writeHead(200, {
            'Content-Type': 'application/x-mpegURL'
        });

        let segmentLength = 10; // Segment length in seconds

        let fileInfo = await databases.file.findById(req.params.id);

        req.video = {};

        req.video.path = fileInfo.path;

        let playlist = "";

        playlist += "#EXTM3U\r\n";
        playlist += "#EXT-X-PLAYLIST-TYPE:VOD\r\n";
        playlist += "#EXT-X-TARGETDURATION:30\r\n";
        playlist += "#EXT-X-VERSION:4\r\n";
        playlist += "#EXT-X-MEDIA-SEQUENCE:0\r\n";

        let numberOfSegments = Math.ceil(fileInfo.duration / segmentLength);

        for (let segment = 0; segment <= numberOfSegments; segment++) {
            if (segment === numberOfSegments) {
                playlist += `#EXTINF:${fileInfo.duration % segmentLength}\r\n`;
            } else {
                playlist += `#EXTINF:${segmentLength},\r\n`;
            }
            playlist += `/HLS/${req.params.id}/segment/${segment}\r\n`;
        }

        playlist += "#EXT-X-ENDLIST\r\n";

        res.write(playlist);
        res.end();
        
        next()

    });
};