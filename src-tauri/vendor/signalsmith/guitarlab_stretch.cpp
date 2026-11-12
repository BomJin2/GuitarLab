// GuitarLab의 Signalsmith Stretch C 래퍼(재생 Rust 이전 R5). 원본 헤더는 수정하지 않습니다.
// 채널별(planar) 버퍼를 받고, C++ 예외는 경계를 넘기지 않습니다.
#include <new>
#include "stretch/signalsmith-stretch.h"

namespace {
using Stretch = signalsmith::stretch::SignalsmithStretch<float>;

struct Planar {
    float *const *channels;
    float *operator[](int c) const { return channels[c]; }
};
} // namespace

extern "C" {

void *guitarlab_stretch_create(int channels, float sample_rate, long seed) {
    try {
        auto *s = new Stretch(seed);
        s->presetDefault(channels, sample_rate);
        return s;
    } catch (...) {
        return nullptr;
    }
}

void guitarlab_stretch_destroy(void *handle) {
    delete static_cast<Stretch *>(handle);
}

void guitarlab_stretch_reset(void *handle) {
    static_cast<Stretch *>(handle)->reset();
}

int guitarlab_stretch_input_latency(void *handle) {
    return static_cast<Stretch *>(handle)->inputLatency();
}

int guitarlab_stretch_output_latency(void *handle) {
    return static_cast<Stretch *>(handle)->outputLatency();
}

int guitarlab_stretch_seek_length(void *handle) {
    return static_cast<Stretch *>(handle)->seekLength();
}

int guitarlab_stretch_seek(void *handle, float *const *input, int frames, double rate) {
    try {
        static_cast<Stretch *>(handle)->seek(Planar{input}, frames, rate);
        return 1;
    } catch (...) {
        return 0;
    }
}

// 입력 첫 프레임부터 출력이 바로 맞도록 미리 계산합니다. 입력 길이는 output_seek_length(rate)여야 합니다.
int guitarlab_stretch_output_seek(void *handle, float *const *input, int frames) {
    try {
        static_cast<Stretch *>(handle)->outputSeek(Planar{input}, frames);
        return 1;
    } catch (...) {
        return 0;
    }
}

int guitarlab_stretch_output_seek_length(void *handle, float rate) {
    return static_cast<Stretch *>(handle)->outputSeekLength(rate);
}

int guitarlab_stretch_process(void *handle, float *const *input, int input_frames,
                              float *const *output, int output_frames) {
    try {
        static_cast<Stretch *>(handle)->process(Planar{input}, input_frames, Planar{output},
                                                output_frames);
        return 1;
    } catch (...) {
        return 0;
    }
}

} // extern "C"
