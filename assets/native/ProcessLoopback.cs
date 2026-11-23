using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace SonaRelay {
public static class ProcessLoopback {
    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface AudioClient {
        void Initialize(int share, uint flags, long duration, long period, ref WaveFormat format, IntPtr session);
        void GetBufferSize(out uint frames);
        void GetStreamLatency(out long latency);
        void GetCurrentPadding(out uint frames);
        void IsFormatSupported(int share, IntPtr format, IntPtr closest);
        void GetMixFormat(out IntPtr format);
        void GetDevicePeriod(out long normal, out long minimum);
        void Start();
        void Stop();
        void Reset();
        void SetEventHandle(IntPtr handle);
        void GetService(ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface CaptureClient {
        void GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong position, out ulong time);
        void ReleaseBuffer(uint frames);
        void GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ActivationOperation {
        void GetActivateResult(out int result, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ActivationCompleted {
        void ActivateCompleted(ActivationOperation operation);
    }

    [ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface AgileObject {}

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class Completion : ActivationCompleted, AgileObject {
        public readonly ManualResetEvent Ready = new ManualResetEvent(false);
        public object Instance;
        public Exception Error;
        public void ActivateCompleted(ActivationOperation operation) {
            try {
                int result;
                operation.GetActivateResult(out result, out Instance);
                Marshal.ThrowExceptionForHR(result);
            } catch (Exception error) { Error = error; }
            finally { Ready.Set(); }
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    struct WaveFormat {
        public ushort Tag, Channels;
        public uint SamplesPerSecond, BytesPerSecond;
        public ushort BlockAlign, BitsPerSample, ExtraSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ActivationParameters {
        public int Type;
        public uint ProcessId;
        public int Mode;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct BlobVariant {
        public ushort Type, Reserved1, Reserved2, Reserved3;
        public int Size;
        public IntPtr Data;
    }

    [DllImport("Mmdevapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int ActivateAudioInterfaceAsync(string device, ref Guid iid, ref BlobVariant parameters,
        ActivationCompleted handler, out ActivationOperation operation);

    static AudioClient Activate(uint processId) {
        var completion = new Completion();
        var parameters = new ActivationParameters { Type = 1, ProcessId = processId, Mode = 0 };
        var size = Marshal.SizeOf(parameters);
        var data = Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(parameters, data, false);
            var variant = new BlobVariant { Type = 65, Size = size, Data = data };
            var iid = typeof(AudioClient).GUID;
            ActivationOperation operation;
            Marshal.ThrowExceptionForHR(ActivateAudioInterfaceAsync(
                "VAD\\Process_Loopback", ref iid, ref variant, completion, out operation));
            // Keep the activation payload and the callback alive until Windows finishes.
            completion.Ready.WaitOne();
            try {
                if (completion.Error != null) throw completion.Error;
                return (AudioClient)completion.Instance;
            } finally { Marshal.ReleaseComObject(operation); }
        } finally {
            completion.Ready.Dispose();
            Marshal.FreeHGlobal(data);
        }
    }

    public static void Run(uint processId) {
        using (var process = Process.GetProcessById((int)processId))
        using (var input = Console.OpenStandardInput())
        using (var output = Console.OpenStandardOutput())
        using (var ready = new AutoResetEvent(false)) {
            var stop = input.ReadAsync(new byte[1], 0, 1);
            var client = Activate(processId);
            try {
                var format = new WaveFormat { Tag = 1, Channels = 2, SamplesPerSecond = 44100,
                    BytesPerSecond = 176400, BlockAlign = 4, BitsPerSample = 16 };
                // LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM, shared mode.
                client.Initialize(0, 0x80060000u, 0, 0, ref format, IntPtr.Zero);
                client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle());
                var iid = typeof(CaptureClient).GUID;
                object service;
                client.GetService(ref iid, out service);
                try {
                    var capture = (CaptureClient)service;
                    client.Start();
                    try {
                        var buffer = new byte[65536];
                        while (!stop.IsCompleted && !process.HasExited) {
                            if (!ready.WaitOne(100)) continue;
                            uint available;
                            capture.GetNextPacketSize(out available);
                            while (available != 0) {
                                IntPtr data;
                                uint frames, flags;
                                ulong position, time;
                                capture.GetBuffer(out data, out frames, out flags, out position, out time);
                                try {
                                    int length = checked((int)frames * 4);
                                    for (int offset = 0; offset < length; offset += buffer.Length) {
                                        int count = Math.Min(length - offset, buffer.Length);
                                        if ((flags & 2) != 0) Array.Clear(buffer, 0, count);
                                        else Marshal.Copy(IntPtr.Add(data, offset), buffer, 0, count);
                                        output.Write(buffer, 0, count);
                                    }
                                } finally { capture.ReleaseBuffer(frames); }
                                capture.GetNextPacketSize(out available);
                            }
                            output.Flush();
                        }
                    } finally { client.Stop(); }
                } finally { Marshal.ReleaseComObject(service); }
            } finally { Marshal.ReleaseComObject(client); }
        }
    }
}
}
