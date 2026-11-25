using System;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

// Layouts and flags come from WinSDK cfapi.h. This provider owns one fixture sync root.
public sealed class CloudFilesFixture : IDisposable
{
    const uint DisableRootPopulation = 2, MarkInSync = 2, StopOnError = 1;
    const ushort FullHydration = 2, AlwaysFullPopulation = 3;
    const uint FetchDataCallback = 0, EndOfCallbacks = uint.MaxValue, TransferDataOperation = 0;
    const uint ReadAttributes = 0x80, OpenExisting = 3, OpenReparsePoint = 0x00200000;
    const uint StandardPlaceholderInfo = 1;
    const int TransferFailed = unchecked((int)0xc0000001);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Registration
    {
        public uint Size;
        public string Name, Version;
        public IntPtr SyncRootIdentity;
        public uint SyncRootIdentityLength;
        public IntPtr FileIdentity;
        public uint FileIdentityLength;
        public Guid ProviderId;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Policies
    {
        public uint Size;
        public ushort Hydration, HydrationModifier, Population, PopulationModifier;
        public uint InSync, HardLink, PlaceholderManagement;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct FileMetadata
    {
        public long CreationTime, LastAccessTime, LastWriteTime, ChangeTime;
        public uint Attributes;
        public long Size;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Placeholder
    {
        public string RelativeName;
        public FileMetadata Metadata;
        public IntPtr Identity;
        public uint IdentityLength, Flags;
        public int Result;
        public long CreatedUsn;
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    delegate void FetchCallback(IntPtr info, IntPtr parameters);

    [StructLayout(LayoutKind.Sequential)]
    struct CallbackRegistration
    {
        public uint Type;
        public IntPtr Callback;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct CallbackInfo
    {
        public uint Size;
        public long ConnectionKey;
        public IntPtr Context, VolumeGuid, VolumeDos;
        public uint VolumeSerial;
        public long SyncRootFileId;
        public IntPtr SyncRootIdentity;
        public uint SyncRootIdentityLength;
        public long FileId, FileSize;
        public IntPtr Identity;
        public uint IdentityLength;
        public IntPtr NormalizedPath;
        public long TransferKey;
        public byte Priority;
        public IntPtr CorrelationVector, ProcessInfo;
        public long RequestKey;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct FetchParameters
    {
        // The callback union starts on an eight-byte boundary.
        public uint Size, Padding, Flags;
        public long Offset, Length;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct OperationInfo
    {
        public uint Size, Type;
        public long ConnectionKey, TransferKey;
        public IntPtr CorrelationVector, SyncStatus;
        public long RequestKey;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TransferParameters
    {
        public uint Size, Padding, Flags;
        public int CompletionStatus;
        public IntPtr Buffer;
        public long Offset, Length;
    }

    [DllImport("cldapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int CfRegisterSyncRoot(string root, ref Registration registration, ref Policies policies, uint flags);

    [DllImport("cldapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int CfUnregisterSyncRoot(string root);

    [DllImport("cldapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int CfConnectSyncRoot(string root, [In] CallbackRegistration[] callbacks,
        IntPtr context, uint flags, out long key);

    [DllImport("cldapi.dll", ExactSpelling = true)]
    static extern int CfDisconnectSyncRoot(long key);

    [DllImport("cldapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int CfCreatePlaceholders(string root, [In, Out] Placeholder[] placeholders,
        uint count, uint flags, out uint processed);

    [DllImport("cldapi.dll", ExactSpelling = true)]
    static extern int CfExecute(ref OperationInfo info, ref TransferParameters parameters);

    [DllImport("cldapi.dll", ExactSpelling = true)]
    static extern int CfGetPlaceholderInfo(SafeFileHandle file, uint kind, [Out] byte[] result,
        uint bufferSize, out uint returned);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security,
        uint disposition, uint flags, IntPtr template);

    readonly string root;
    readonly byte[][] localBytes;
    readonly int[] fetches = new int[2];
    readonly ConcurrentQueue<string> failures = new ConcurrentQueue<string>();
    readonly FetchCallback callback;
    long connectionKey;
    bool registered, connected;

    public CloudFilesFixture(string root, string png, string jpeg)
    {
        this.root = root;
        localBytes = new[] { File.ReadAllBytes(png), File.ReadAllBytes(jpeg) };
        callback = Fetch;
        var registration = new Registration {
            Size = (uint)Marshal.SizeOf<Registration>(), Name = "Image Files to PDF native QA",
            Version = "1", ProviderId = new Guid("856872c9-d580-4790-b83d-c5af66b7dc5a")
        };
        var policies = new Policies {
            Size = (uint)Marshal.SizeOf<Policies>(), Hydration = FullHydration, Population = AlwaysFullPopulation
        };
        Check("CfRegisterSyncRoot", CfRegisterSyncRoot(root, ref registration, ref policies, DisableRootPopulation));
        registered = true;
        try
        {
            var callbacks = new[] {
                new CallbackRegistration { Type = FetchDataCallback, Callback = Marshal.GetFunctionPointerForDelegate(callback) },
                new CallbackRegistration { Type = EndOfCallbacks }
            };
            Check("CfConnectSyncRoot", CfConnectSyncRoot(root, callbacks, IntPtr.Zero, 0, out connectionKey));
            connected = true;
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    static void Check(string operation, int result)
    {
        if (result < 0) throw new InvalidOperationException($"{operation} returned HRESULT 0x{result:X8}.");
    }

    public void Create(string name, int index)
    {
        var identity = Marshal.AllocHGlobal(sizeof(int));
        try
        {
            Marshal.WriteInt32(identity, index);
            var now = DateTime.UtcNow.ToFileTimeUtc();
            var entries = new[] { new Placeholder {
                RelativeName = name, Identity = identity, IdentityLength = sizeof(int), Flags = MarkInSync,
                Metadata = new FileMetadata {
                    CreationTime = now, LastAccessTime = now, LastWriteTime = now, ChangeTime = now,
                    Attributes = (uint)FileAttributes.Normal, Size = localBytes[index].LongLength
                }
            }};
            Check($"CfCreatePlaceholders({name})", CfCreatePlaceholders(root, entries, 1, StopOnError, out uint processed));
            if (processed != 1) throw new InvalidOperationException($"CfCreatePlaceholders({name}) processed {processed} entries.");
            Check($"CfCreatePlaceholders({name}) entry", entries[0].Result);
        }
        finally { Marshal.FreeHGlobal(identity); }
    }

    public long BytesOnDisk(string name)
    {
        // Attribute access with OPEN_REPARSE_POINT observes state without hydrating the file.
        using var file = CreateFileW(Path.Combine(root, name), ReadAttributes, 7, IntPtr.Zero,
            OpenExisting, OpenReparsePoint, IntPtr.Zero);
        if (file.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), $"Open placeholder attributes ({name})");
        var data = new byte[128];
        Check($"CfGetPlaceholderInfo({name})", CfGetPlaceholderInfo(file, StandardPlaceholderInfo,
            data, (uint)data.Length, out uint returned));
        if (returned < sizeof(long)) throw new InvalidOperationException($"Placeholder information for {name} is incomplete.");
        return BitConverter.ToInt64(data, 0);
    }

    void Fetch(IntPtr infoPointer, IntPtr parametersPointer)
    {
        var info = Marshal.PtrToStructure<CallbackInfo>(infoPointer);
        var request = Marshal.PtrToStructure<FetchParameters>(parametersPointer);
        var operation = new OperationInfo {
            Size = (uint)Marshal.SizeOf<OperationInfo>(), Type = TransferDataOperation,
            ConnectionKey = info.ConnectionKey, TransferKey = info.TransferKey,
            CorrelationVector = info.CorrelationVector, RequestKey = info.RequestKey
        };
        var response = new TransferParameters { Size = (uint)Marshal.SizeOf<TransferParameters>() };
        try
        {
            if (info.IdentityLength != sizeof(int)) throw new InvalidOperationException("Invalid placeholder identity length.");
            int index = Marshal.ReadInt32(info.Identity);
            var bytes = localBytes[index];
            if (info.FileSize != bytes.LongLength) throw new InvalidOperationException("Placeholder source length differs.");
            var pin = GCHandle.Alloc(bytes, GCHandleType.Pinned);
            try
            {
                response.Buffer = pin.AddrOfPinnedObject();
                response.Length = bytes.LongLength;
                Check("CfExecute(TRANSFER_DATA)", CfExecute(ref operation, ref response));
                Interlocked.Increment(ref fetches[index]);
            }
            finally { pin.Free(); }
        }
        catch (Exception error)
        {
            failures.Enqueue(error.Message);
            response.Buffer = IntPtr.Zero;
            response.CompletionStatus = TransferFailed;
            response.Offset = request.Offset;
            response.Length = request.Length;
            int result = CfExecute(ref operation, ref response);
            if (result < 0) failures.Enqueue($"CfExecute(TRANSFER_DATA failure response) returned HRESULT 0x{result:X8}.");
        }
    }

    public int FetchCount(int index)
    {
        if (!failures.IsEmpty) throw new InvalidOperationException(string.Join(Environment.NewLine, failures));
        return Volatile.Read(ref fetches[index]);
    }

    public void Dispose()
    {
        try
        {
            if (connected)
            {
                connected = false;
                Check("CfDisconnectSyncRoot", CfDisconnectSyncRoot(connectionKey));
            }
        }
        finally
        {
            if (registered)
            {
                registered = false;
                Check("CfUnregisterSyncRoot", CfUnregisterSyncRoot(root));
            }
            GC.KeepAlive(callback);
        }
    }
}
