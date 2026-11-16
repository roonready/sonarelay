using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace SonaRelay {
    public static class WaveOutPlayer {
        [StructLayout(LayoutKind.Sequential)] struct WaveFormat {
            public ushort formatTag, channels;
            public uint samplesPerSec, avgBytesPerSec;
            public ushort blockAlign, bitsPerSample, extraSize;
        }
        [StructLayout(LayoutKind.Sequential)] struct WaveHeader {
            public IntPtr data;
            public uint length, recorded;
            public UIntPtr user;
            public uint flags, loops;
            public IntPtr next;
            public UIntPtr reserved;
        }
        [DllImport("winmm.dll")] static extern uint waveOutOpen(out IntPtr handle, uint device, ref WaveFormat format, IntPtr callback, IntPtr instance, uint flags);
        [DllImport("winmm.dll")] static extern uint waveOutPrepareHeader(IntPtr handle, IntPtr header, uint size);
        [DllImport("winmm.dll")] static extern uint waveOutWrite(IntPtr handle, IntPtr header, uint size);
        [DllImport("winmm.dll")] static extern uint waveOutUnprepareHeader(IntPtr handle, IntPtr header, uint size);
        [DllImport("winmm.dll")] static extern uint waveOutReset(IntPtr handle);
        [DllImport("winmm.dll")] static extern uint waveOutClose(IntPtr handle);
        sealed class Slot {
            public byte[] bytes = new byte[8192];
            public GCHandle pinned;
            public IntPtr header;
            public bool prepared;
        }
        static void Check(uint code) { if (code != 0) throw new IOException("waveout:" + code); }
        static bool Complete(Slot slot) { return !slot.prepared || ((((WaveHeader)Marshal.PtrToStructure(slot.header, typeof(WaveHeader))).flags & 1) != 0); }
        public static void Run(int rate) {
            IntPtr output = IntPtr.Zero;
            Slot[] slots = new Slot[4];
            uint headerSize = (uint)Marshal.SizeOf(typeof(WaveHeader));
            bool playing = false;
            long completedBytes = 0;
            try {
                WaveFormat format = new WaveFormat { formatTag = 1, channels = 2, samplesPerSec = (uint)rate, avgBytesPerSec = (uint)(rate * 4), blockAlign = 4, bitsPerSample = 16 };
                Check(waveOutOpen(out output, 0xffffffff, ref format, IntPtr.Zero, IntPtr.Zero, 0));
                for (int i = 0; i < slots.Length; i++) {
                    slots[i] = new Slot(); slots[i].pinned = GCHandle.Alloc(slots[i].bytes, GCHandleType.Pinned);
                    slots[i].header = Marshal.AllocHGlobal((int)headerSize);
                }
                Console.WriteLine("ready"); Console.Out.Flush();
                Stream input = Console.OpenStandardInput();
                int next = 0;
                while (true) {
                    Slot slot = slots[next]; next = (next + 1) % slots.Length;
                    while (!Complete(slot)) Thread.Sleep(5);
                    if (slot.prepared) {
                        completedBytes += ((WaveHeader)Marshal.PtrToStructure(slot.header, typeof(WaveHeader))).length;
                        if (!playing) { playing = true; Console.WriteLine("playing"); Console.Out.Flush(); }
                        Check(waveOutUnprepareHeader(output, slot.header, headerSize)); slot.prepared = false;
                    }
                    int count = 0;
                    while (count < slot.bytes.Length) {
                        int read = input.Read(slot.bytes, count, slot.bytes.Length - count);
                        if (read == 0) break;
                        count += read;
                    }
                    if (count == 0) break;
                    if (count % 4 != 0) throw new IOException("waveout:alignment");
                    WaveHeader header = new WaveHeader { data = slot.pinned.AddrOfPinnedObject(), length = (uint)count };
                    Marshal.StructureToPtr(header, slot.header, false);
                    Check(waveOutPrepareHeader(output, slot.header, headerSize)); slot.prepared = true;
                    Check(waveOutWrite(output, slot.header, headerSize));
                }
                foreach (Slot slot in slots) {
                    if (slot == null || !slot.prepared) continue;
                    while (!Complete(slot)) Thread.Sleep(5);
                    completedBytes += ((WaveHeader)Marshal.PtrToStructure(slot.header, typeof(WaveHeader))).length;
                }
                Console.WriteLine("played:" + completedBytes); Console.Out.Flush();
            } finally {
                if (output != IntPtr.Zero) waveOutReset(output);
                foreach (Slot slot in slots) {
                    if (slot == null) continue;
                    if (slot.prepared) waveOutUnprepareHeader(output, slot.header, headerSize);
                    if (slot.header != IntPtr.Zero) Marshal.FreeHGlobal(slot.header);
                    if (slot.pinned.IsAllocated) slot.pinned.Free();
                }
                if (output != IntPtr.Zero) waveOutClose(output);
            }
        }
    }
}
