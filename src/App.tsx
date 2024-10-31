import React, { useState, useEffect, useRef, memo } from "react";
import ReactPlayer from "react-player";
import Hls from "hls.js";
import {
  Grid,
  Maximize2,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";

interface Stream {
  title: string;
  url: string;
  originalUrl: string;
  type: "youtube" | "hls";
  snapshotUrl?: string | null;
}

interface ThumbnailProps {
  stream: Stream;
  title: string;
}

const Thumbnail: React.FC<ThumbnailProps> = memo(({ stream, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  useEffect(() => {
    if (!inView || stream.type !== "hls") return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    let hls: Hls | null = null;

    const captureFrame = () => {
      if (video && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataURL = canvas.toDataURL("image/jpeg");
          setSnapshot(dataURL);
        }
      }
    };

    const loadAndCapture = () => {
      if (Hls.isSupported()) {
        hls = new Hls({
          maxBufferLength: 1, // Minimal buffering
          maxMaxBufferLength: 2,
          debug: false,
        });
        hls.loadSource(stream.url);
        if (video) {
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video
              .play()
              .then(() => {
                // Wait for the video to be ready
                video.currentTime = 0; // Seek to the start
              })
              .catch((err) => {
                console.error(`Error playing video for snapshot: ${err}`);
              });
          });
          video.addEventListener("canplay", onCanPlay);
        }
      } else if (video?.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = stream.url;
        video.addEventListener("loadedmetadata", () => {
          video.play().catch((err) => {
            console.error(`Error playing video for snapshot: ${err}`);
          });
        });
        video?.addEventListener("canplay", onCanPlay);
      } else {
        console.error("HLS not supported in this browser");
        setSnapshot(null);
        return;
      }
    };

    const onCanPlay = () => {
      captureFrame(); // Immediate snapshot capture
      // Unload the video to prevent buffering
      cleanup();
    };

    const cleanup = () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (hls) {
        hls.destroy();
      }
    };

    loadAndCapture();

    const intervalId = setInterval(() => {
      loadAndCapture();
    }, 5000); // Capture every 5 seconds

    return () => {
      clearInterval(intervalId);
      cleanup();
      setSnapshot(null);
    };
  }, [inView, stream.url, stream.type]);

  return (
    <div className="relative w-full h-full" ref={ref}>
      {stream.type === "youtube" && stream.snapshotUrl ? (
        <img
          src={`${stream.snapshotUrl}?t=${new Date().getTime()}`}
          alt={title}
          className="w-full h-full object-cover"
          onError={() => {
            console.error(`Error loading snapshot for ${title}`);
          }}
        />
      ) : stream.type === "hls" ? (
        snapshot ? (
          <img
            src={snapshot}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-500">Loading...</p>
          </div>
        )
      ) : null}
      <video
        ref={videoRef}
        style={{ display: "none" }}
        muted
        playsInline
      ></video>
      <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
    </div>
  );
});

const StreamViewer = () => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [mutedStates, setMutedStates] = useState<Record<string, boolean>>({});
  const [errorStates, setErrorStates] = useState<Record<string, boolean>>({});
  const [retryAttempts, setRetryAttempts] = useState<Record<string, number>>(
    {}
  );
  const maxRetries = 3;
  const retryDelay = 5000;

  const convertToProxyUrl = (originalUrl: string): string => {
    if (process.env.NODE_ENV === "production") {
      return `/api/proxy?url=${encodeURIComponent(originalUrl)}`;
    }

    try {
      const url = new URL(originalUrl);

      if (url.hostname.includes("youtube.com")) {
        return `/yt${url.pathname}${url.search}`;
      }

      return `/stream${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      console.error("Invalid URL:", originalUrl);
      return originalUrl;
    }
  };

  const getSnapshotUrl = (stream: Stream): string | null => {
    if (stream.type === "youtube") {
      const url = new URL(stream.originalUrl);
      const videoId = url.searchParams.get("v");
      return videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : null;
    } else if (stream.type === "hls") {
      return null;
    }
    return null;
  };

  useEffect(() => {
    const parseM3U8 = (content: string): Stream[] => {
      const lines = content.split("\n");
      const streams: Stream[] = [];
      let currentTitle = "";

      lines.forEach((line) => {
        if (line.startsWith("#EXTINF:")) {
          currentTitle = line.split(",")[1];
        } else if (line.startsWith("http")) {
          const originalUrl = line.trim();
          const proxyUrl = convertToProxyUrl(originalUrl);

          const isYouTube = originalUrl.includes("youtube.com");

          const stream: Stream = {
            title: currentTitle,
            url: proxyUrl,
            originalUrl: originalUrl,
            type: isYouTube ? "youtube" : "hls",
          };

          const snapshotUrl = getSnapshotUrl(stream);
          streams.push({ ...stream, snapshotUrl });
        }
      });

      return streams;
    };

    const playlistContent = `
#EXTINF:-1,Director Mode
https://ft.3045x.com/9b249j7qlqu0fypg/index.m3u8
#EXTINF:-1,Den
https://ftest.3045x.com/d678xcnkn2slngkx/index.m3u8
#EXTINF:-1,Den PTZ
https://ftest.3045x.com/8e1arf44e86qa7ru/index.m3u8
#EXTINF:-1,Lounge
https://ftest.3045x.com/9f41r40060icglir/index.m3u8
#EXTINF:-1,Locker Room
https://ftest.3045x.com/7d3e7e9s5qm5l1uf/index.m3u8
#EXTINF:-1,Deck
https://ftest.3045x.com/b4e4iknxyd1u4g0c/index.m3u8
#EXTINF:-1,Yard
https://ftest.3045x.com/8ac015orral0pm4c/index.m3u8
#EXTINF:-1,Yard PTZ
https://ftest.3045x.com/b51399w8tr5qa0v1/index.m3u8
#EXTINF:-1,Catwalk
https://ftest.3045x.com/580elsslerqmt28u/index.m3u8
#EXTINF:-1,Mail Room
https://ftest.3045x.com/84485q0ve58ckwm2/index.m3u8
#EXTINF:-1,Kitchen
https://ftest.3045x.com/8c8btla37r6nux8f/index.m3u8
#EXTINF:-1,Island
https://ftest.3045x.com/d578z2acldqyww5x/index.m3u8
#EXTINF:-1,Dining Room
https://ftest.3045x.com/afacw5eipuyfsfny/index.m3u8
#EXTINF:-1,Hallway
https://ftest.3045x.com/3760543f053u6c5m/index.m3u8
#EXTINF:-1,Bedroom 1
https://ftest.3045x.com/b65269ekvyvfkous/index.m3u8
#EXTINF:-1,Bedroom 2
https://ftest.3045x.com/36708jd80gr91018/index.m3u8
#EXTINF:-1,Bedroom 3
https://ftest.3045x.com/44daqjc6r1dfxd2e/index.m3u8
#EXTINF:-1,Vanity
https://ftest.3045x.com/68f8q4hl8cys37n2/index.m3u8
#EXTINF:-1,Penthouse
https://ftest.3045x.com/0c0bun9tebd65k3j/index.m3u8
#EXTINF:-1,Loft
https://ftest.3045x.com/9d5ckl8snb01ba6i/index.m3u8
#EXTINF:-1,Jacuzzi
https://ftest.3045x.com/122bkgvyrj1f7pk4/index.m3u8
#EXTINF:-1,Bar
https://ftest.3045x.com/f77b5hz939s8z89b/index.m3u8
#EXTINF:-1,Flat
https://ftest.3045x.com/4fb8to1674q6ht0m/index.m3u8
#EXTINF:-1,Confessional
https://ftest.3045x.com/21aflvcz5puavd2e/index.m3u8`;

    const parsedStreams = parseM3U8(playlistContent);
    setStreams(parsedStreams);

    const initialMutedStates: Record<string, boolean> = {};
    const initialErrorStates: Record<string, boolean> = {};
    parsedStreams.forEach((stream) => {
      initialMutedStates[stream.url] = true;
      initialErrorStates[stream.url] = false;
    });
    setMutedStates(initialMutedStates);
    setErrorStates(initialErrorStates);
  }, []);

  const toggleMute = (streamUrl: string) => {
    setMutedStates((prev) => ({
      ...prev,
      [streamUrl]: !prev[streamUrl],
    }));
  };

  const handleStreamError = (streamUrl: string) => {
    console.error(`Error loading stream: ${streamUrl}`);
    const currentAttempts = retryAttempts[streamUrl] || 0;

    if (currentAttempts < maxRetries) {
      const delay = retryDelay * Math.pow(2, currentAttempts);
      setTimeout(() => {
        setRetryAttempts((prev) => ({
          ...prev,
          [streamUrl]: currentAttempts + 1,
        }));

        setErrorStates((prev) => ({
          ...prev,
          [streamUrl]: false,
        }));
      }, delay);
    } else {
      setErrorStates((prev) => ({
        ...prev,
        [streamUrl]: true,
      }));
    }
  };

  const StreamPlayer = ({
    stream,
    isFullscreen = false,
  }: {
    stream: Stream;
    isFullscreen?: boolean;
  }) => {
    const playerRef = useRef<ReactPlayer | null>(null);

    const playerConfig = {
      file: {
        forceHLS: true,
        hlsOptions: {
          enableWorker: true,
          autoStartLoad: true,
          startLevel: -1,

          maxBufferSize: 60 * 1000 * 1000,
          maxBufferLength: 60,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          liveDurationInfinity: true,

          manifestLoadingTimeOut: 30000,
          manifestLoadingMaxRetry: 6,
          levelLoadingTimeOut: 30000,
          levelLoadingMaxRetry: 6,
        },
      },
    };

    useEffect(() => {
      if (playerRef.current) {
        const player = playerRef.current.getInternalPlayer();
        if (player && player.loadSource) {
          player.loadSource(stream.url);
        }
      }
    }, [stream.url, isFullscreen]);

    return (
      <ReactPlayer
        ref={playerRef}
        url={stream.url}
        width="100%"
        height="100%"
        playing={true}
        controls={isFullscreen}
        onError={() => handleStreamError(stream.url)}
        config={playerConfig}
        playsinline={true}
        stopOnUnmount={false}
        onBuffer={() => console.log("Buffering...")}
        onBufferEnd={() => console.log("Buffering ended")}
        pip={false}
        light={false}
        volume={1}
        fallback={<div>Loading...</div>}
      />
    );
  };

  const handleBackToGrid = () => {
    setSelectedStream(null);
  };

  const SingleStreamView = () => {
    if (!selectedStream) return null;

    const currentIndex = streams.findIndex(
      (stream) => stream.url === selectedStream.url
    );

    const handlePrevious = () => {
      const previousIndex =
        (currentIndex - 1 + streams.length) % streams.length;
      setSelectedStream(streams[previousIndex]);
    };

    const handleNext = () => {
      const nextIndex = (currentIndex + 1) % streams.length;
      setSelectedStream(streams[nextIndex]);
    };

    return (
      <div className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleBackToGrid}
            className="flex items-center gap-2"
          >
            <Grid size={16} />
            Back to Grid
          </Button>
          <Button
            variant="outline"
            onClick={handlePrevious}
            className="flex items-center gap-2"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            onClick={handleNext}
            className="flex items-center gap-2"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <Card className="relative">
          <div className="aspect-video">
            {errorStates[selectedStream.url] ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <p className="text-red-500">Failed to load stream</p>
              </div>
            ) : (
              <StreamPlayer stream={selectedStream} isFullscreen={true} />
            )}
          </div>
          <div className="p-4">
            <h2 className="text-xl font-bold">{selectedStream.title}</h2>
          </div>
        </Card>
      </div>
    );
  };

  const GridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {streams.map((stream) => (
        <Card key={stream.url} className="relative">
          <div className="aspect-video relative">
            {errorStates[stream.url] ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <p className="text-red-500">Failed to load stream</p>
              </div>
            ) : (
              <Thumbnail stream={stream} title={stream.title} />
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 flex justify-between items-center">
              <span className="text-white text-sm truncate">
                {stream.title}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMute(stream.url)}
                  className="text-white hover:bg-white/20"
                >
                  {mutedStates[stream.url] ? (
                    <VolumeX size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStream(stream)}
                  className="text-white hover:bg-white/20"
                >
                  <Maximize2 size={16} />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto">
        {selectedStream ? <SingleStreamView /> : <GridView />}
      </div>
    </div>
  );
};

export default StreamViewer;
