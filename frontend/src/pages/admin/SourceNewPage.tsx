import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DocType } from '@ledger/shared';
import { api } from '../../lib/api';

const docTypes: Array<{ value: DocType; label: string }> = [
  { value: 'PDF', label: 'PDF Document' },
  { value: 'HTML', label: 'HTML Page' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'OTHER', label: 'Other' },
];

export default function AdminSourceNewPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'metadata' | 'upload' | 'verify'>('metadata');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('');
  const [docType, setDocType] = useState<DocType>('PDF');
  const [excerpt, setExcerpt] = useState('');
  const [notes, setNotes] = useState('');

  // Created source
  const [sourceId, setSourceId] = useState<string | null>(null);

  // File upload
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const source = await api.createSource({
        title,
        publisher,
        url,
        docType,
        excerpt: excerpt || undefined,
        notes: notes || undefined,
      });

      setSourceId(source.sourceId);
      setStep('upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!file || !sourceId) return;

    try {
      setUploading(true);
      setError(null);

      // Get presigned URL
      const { uploadUrl } = await api.getSourceUploadUrl(sourceId, file.type);

      // Upload file
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleFinalize() {
    if (!sourceId) return;

    try {
      setLoading(true);
      setError(null);

      await api.finalizeSource(sourceId);

      // Done! Navigate back
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Source</h1>

      {/* Progress steps */}
      <div className="flex items-center mb-8">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full ${
            step === 'metadata'
              ? 'bg-primary-600 text-white'
              : 'bg-green-600 text-white'
          }`}
        >
          1
        </div>
        <div className="flex-1 h-1 mx-2 bg-gray-200">
          <div
            className={`h-full bg-green-600 transition-all ${
              step === 'metadata' ? 'w-0' : 'w-full'
            }`}
          />
        </div>
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full ${
            step === 'upload'
              ? 'bg-primary-600 text-white'
              : step === 'verify'
              ? 'bg-green-600 text-white'
              : 'bg-gray-300 text-gray-600'
          }`}
        >
          2
        </div>
        <div className="flex-1 h-1 mx-2 bg-gray-200">
          <div
            className={`h-full bg-green-600 transition-all ${
              step === 'verify' ? 'w-full' : 'w-0'
            }`}
          />
        </div>
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full ${
            step === 'verify'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-300 text-gray-600'
          }`}
        >
          3
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Step 1: Metadata */}
      {step === 'metadata' && (
        <form onSubmit={handleCreateSource} className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Source Metadata
          </h2>

          <div>
            <label htmlFor="title" className="label">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="publisher" className="label">
              Publisher * <span className="font-normal text-gray-500">(e.g., DOJ, SEC, EPA)</span>
            </label>
            <input
              id="publisher"
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="url" className="label">
              Original URL *
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="input"
              placeholder="https://..."
              required
            />
          </div>

          <div>
            <label htmlFor="docType" className="label">
              Document Type *
            </label>
            <select
              id="docType"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
              className="input"
            >
              {docTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="excerpt" className="label">
              Excerpt <span className="font-normal text-gray-500">(key quote from source)</span>
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="input"
              rows={2}
            />
          </div>

          <div>
            <label htmlFor="notes" className="label">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              rows={2}
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creating...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Upload */}
      {step === 'upload' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Upload Document
          </h2>

          <p className="text-gray-600 text-sm">
            Source ID: <code className="bg-gray-100 px-1 rounded">{sourceId}</code>
          </p>

          <div>
            <label htmlFor="file" className="label">
              Select File
            </label>
            <input
              id="file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input"
              accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.gif,.webp"
            />
            <p className="mt-1 text-sm text-gray-500">
              Accepted: PDF, HTML, PNG, JPEG, GIF, WebP. Max 50 MB.
            </p>
          </div>

          {file && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="text-sm">
                <strong>Selected:</strong> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => setStep('metadata')}
              className="btn-secondary"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Verify */}
      {step === 'verify' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Verify & Finalize
          </h2>

          <p className="text-gray-600">
            The document has been uploaded. Click "Finalize" to verify the
            document integrity and create a signed verification manifest.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h3 className="font-medium text-gray-900 mb-2">
              Verification Process
            </h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✓ Validate file type and size</li>
              <li>✓ Compute SHA-256 content hash</li>
              <li>✓ Create verification manifest</li>
              <li>✓ Sign manifest with KMS</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleFinalize}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Verifying...' : 'Finalize'}
            </button>
            <button
              onClick={() => setStep('upload')}
              className="btn-secondary"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
