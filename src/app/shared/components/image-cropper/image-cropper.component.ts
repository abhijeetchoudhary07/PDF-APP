import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';

import { ModalController } from '@ionic/angular';
import Cropper from 'cropperjs';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-image-cropper',
  templateUrl: './image-cropper.component.html',
  styleUrls: ['./image-cropper.component.scss'],
  standalone: true,
  imports: []
})
export class ImageCropperComponent implements AfterViewInit, OnDestroy {
  private modalCtrl = inject(ModalController);

  @Input() imageSrc!: string;
  @ViewChild('image', { static: false }) imageElement!: ElementRef<HTMLImageElement>;

  selectedRatio = 0;
  private cropper?: Cropper;

  ngAfterViewInit() {
    setTimeout(() => {
      if (this.imageElement && this.imageElement.nativeElement) {
        this.cropper = new Cropper(this.imageElement.nativeElement, {
          viewMode: 1,
          dragMode: 'crop',
          responsive: true,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
        });
      }
    }, 100);
  }

  ngOnDestroy() {
    if (this.cropper) {
      this.cropper.destroy();
    }
  }

  setRatio(ratio: number) {
    this.selectedRatio = ratio;
    if (ratio === 0) {
      this.cropper?.setAspectRatio(NaN);
    } else {
      this.cropper?.setAspectRatio(ratio);
    }
  }

  rotate() {
    this.cropper?.rotate(90);
  }

  cancel() {
    this.modalCtrl.dismiss(null);
  }

  confirm() {
    if (!this.cropper) return;

    const canvas = this.cropper.getCroppedCanvas();
    if (!canvas) {
      this.cancel();
      return;
    }

    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        this.modalCtrl.dismiss(blob);
      }
    }, 'image/jpeg', 1.0);
  }
}
