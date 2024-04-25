  import { HttpClient, HttpClientModule, HttpEventType, HttpProgressEvent } from '@angular/common/http';
  import { Component, inject } from '@angular/core';

  interface Chunk {
    chunk: ArrayBuffer;
    chunkIndex: number;
    totalChunks: number;
  }

  @Component({
    selector: 'app-upload-file',
    standalone: true,
    imports: [HttpClientModule],
    templateUrl: './upload-file.component.html',
    styleUrl: './upload-file.component.scss'
  })
  export class UploadFileComponent {
    protected files: Array<File> = []
    protected uploadProgress: { [fileName: string]: number } = {}; // Track upload progress for each file
    protected uploadStatus: string = '';

    onDragOver(event: DragEvent) {
      event.preventDefault();
    }

    async onDrop(event: DragEvent) {
      event.preventDefault();
      
      if (event.dataTransfer && event.dataTransfer.files) {
        this.files = Array.from(event.dataTransfer.files)
        await this.uploadFile(event.dataTransfer.files[0]);
      }
    }

    async* getFileChunks(file: File, chunkSize: number): AsyncGenerator<Chunk> {
      const totalChunks = Math.ceil(file.size / chunkSize);
      let start = 0;
    
      for (let i = 0; i < totalChunks; i++) {
        const end = Math.min(start + chunkSize, file.size);
        const chunk = await new Promise<ArrayBuffer>((resolve) => {
          const reader = new FileReader();
          reader.readAsArrayBuffer(file.slice(start, end));
          reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve(reader.result);
            } else {
              console.error('Unexpected data type from FileReader');
            }
          };
        });
        yield { chunk, chunkIndex: i + 1, totalChunks };
        start = end;
      }
    }

    async uploadFile(file: File) {
      const chunkSize = 5 * 1024 * 1024; // 5 MB chunk size
      this.uploadProgress[file.name] = 0; // Initialize progress for this file
      let totalUploaded = 0;

      for await (const { chunk, chunkIndex, totalChunks } of this.getFileChunks(file, chunkSize)) {
        try {
          const formData = new FormData();
          formData.append('chunk', new Blob([chunk]));

          const uploadRequest = new Request('http://localhost:8080/upload', {
            method: 'POST',
            body: formData,
            headers: {
              'X-File-Name': file.name,
              'X-File-Size': file.size.toString(),
              'X-Chunk-Index': chunkIndex.toString(),
              'X-Total-Chunks': totalChunks.toString(),
            }
          });

          const response = await fetch(uploadRequest);

          if (!response.ok) {
            throw new Error(`Upload failed for chunk ${chunkIndex}: ${response.statusText}`);
          }

          totalUploaded += chunk.byteLength; // Add chunk size to total uploaded

          const uploadedSize = totalUploaded; // Use totalUploaded for progress calculation
          const totalSize = file.size;
          const progress = Math.round((uploadedSize / totalSize) * 100); // Calculate progress
    
          this.uploadProgress[file.name] = progress
          console.log(`Chunk ${chunkIndex} uploaded successfully. Progress: ${progress}%`);
        } catch (error) {
          if (error instanceof Error) {
            console.error(error.message);
          }
        }
      }
    
      console.log('File uploaded successfully!');
      // delete this.uploadProgress[file.name]; // Remove progress for uploaded file
    }
  }
