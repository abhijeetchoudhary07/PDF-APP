import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular';

import { FormsModule } from '@angular/forms';
import { PresetService, Preset } from '../../core/services/preset.service';
import { ToastService } from '../../core/services/toast.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppModalComponent,
  AppIconComponent,
  AppSkeletonComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-presets',
  templateUrl: './presets.page.html',
  styleUrls: ['./presets.page.scss'],
  standalone: true,
  imports: [
    AppSkeletonComponent,
    AppIconComponent,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppModalComponent,
    TranslatePipe
]
})
export class PresetsPage implements OnInit {
  private presetService = inject(PresetService);
  private navCtrl = inject(NavController);
  private alertCtrl = inject(AlertController);
  private toast = inject(ToastService);

  groupedPresets: { category: string, presets: Preset[] }[] = [];
  selectedPreset?: Preset;

  // Custom Preset Form State
  showModal = false;
  editingPreset: Preset = this.getEmptyPreset();
  enablePhoto = false;
  enableSig = false;
  enablePdf = false;

  async ngOnInit() {
    await this.loadPresets();
  }

  /* Guards the list against rendering as "empty" while presets are still read. */
  isLoading = true;

  async loadPresets() {
    try {
      this.groupedPresets = await this.presetService.getAllGroupedPresets();
    } finally {
      this.isLoading = false;
    }
  }

  selectPreset(preset: Preset) {
    this.selectedPreset = this.selectedPreset === preset ? undefined : preset;
  }

  goToTool(tool: 'photo' | 'signature' | 'pdf', presetId: string) {
    this.navCtrl.navigateForward(`/${tool}`, {
      queryParams: { preset: presetId }
    });
  }

  getEmptyPreset(): Preset {
    return {
      id: '',
      name: '',
      category: 'My Custom Presets',
      isCustom: true,
      photo: {},
      signature: {},
      pdf: {}
    };
  }

  openCreateModal() {
    this.editingPreset = this.getEmptyPreset();
    this.enablePhoto = false;
    this.enableSig = false;
    this.enablePdf = false;
    this.showModal = true;
  }

  openEditModal(preset: Preset) {
    this.editingPreset = JSON.parse(JSON.stringify(preset)); // Deep copy
    this.enablePhoto = !!this.editingPreset.photo && Object.keys(this.editingPreset.photo).length > 0;
    this.enableSig = !!this.editingPreset.signature && Object.keys(this.editingPreset.signature).length > 0;
    this.enablePdf = !!this.editingPreset.pdf && Object.keys(this.editingPreset.pdf).length > 0;
    
    if (!this.editingPreset.photo) this.editingPreset.photo = {};
    if (!this.editingPreset.signature) this.editingPreset.signature = {};
    if (!this.editingPreset.pdf) this.editingPreset.pdf = {};
    
    this.showModal = true;
  }

  async duplicatePreset(preset: Preset) {
    const copy = JSON.parse(JSON.stringify(preset));
    copy.id = `custom_${Date.now()}`;
    copy.name = `${copy.name} (Copy)`;
    copy.isCustom = true;
    copy.category = 'My Custom Presets';
    await this.presetService.saveCustomPreset(copy);
    await this.loadPresets();
  }

  async deletePreset(preset: Preset) {
    /*
     * An Ionic alert rather than `confirm()`. The native dialog freezes the
     * whole web view until it is dismissed, and on Android it is drawn by the
     * system with "localhost says" above the question -- which reads like the
     * page has been hijacked rather than like the app asking. This one is
     * themed, non-blocking, and names the destructive button.
     */
    const alert = await this.alertCtrl.create({
      header: 'Delete preset?',
      message: `"${preset.name}" will be removed from this device. Saved files are not affected.`,
      buttons: [
        { text: 'Keep', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') {
      return;
    }

    await this.presetService.deleteCustomPreset(preset.id);
    this.selectedPreset = undefined;
    await this.loadPresets();
    this.toast.success(`Deleted "${preset.name}".`);
  }

  async saveModal() {
    if (!this.editingPreset.name) {
      this.toast.warning('Give the preset a name first.');
      return;
    }
    
    if (!this.editingPreset.id) {
       this.editingPreset.id = `custom_${Date.now()}`;
    }

    if (!this.enablePhoto) this.editingPreset.photo = undefined;
    if (!this.enableSig) this.editingPreset.signature = undefined;
    if (!this.enablePdf) this.editingPreset.pdf = undefined;

    await this.presetService.saveCustomPreset(this.editingPreset);
    this.showModal = false;
    await this.loadPresets();
  }
}
