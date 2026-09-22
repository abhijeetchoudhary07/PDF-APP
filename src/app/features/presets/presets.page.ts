import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { IonicModule, NavController } from '@ionic/angular/lazy';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresetService, Preset } from '../../core/services/preset.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppModalComponent,
  AppIconComponent,
  AppSkeletonComponent
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
    IonicModule,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppModalComponent
  ]
})
export class PresetsPage implements OnInit {
  groupedPresets: { category: string, presets: Preset[] }[] = [];
  selectedPreset?: Preset;

  // Custom Preset Form State
  showModal = false;
  editingPreset: Preset = this.getEmptyPreset();
  enablePhoto = false;
  enableSig = false;
  enablePdf = false;

  constructor(private presetService: PresetService, private navCtrl: NavController) {}

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
    if (confirm(`Are you sure you want to delete "${preset.name}"?`)) {
       await this.presetService.deleteCustomPreset(preset.id);
       this.selectedPreset = undefined;
       await this.loadPresets();
    }
  }

  async saveModal() {
    if (!this.editingPreset.name) {
      alert('Please enter a name for the preset.');
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
