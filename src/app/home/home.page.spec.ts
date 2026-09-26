import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../test-setup';

import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';

import { ToolRegistryService } from '../core/services/tool-registry.service';
import { TranslationService } from '../core/services/translation.service';

/*
 * HomePage is standalone now, so it goes in `imports` and brings its own
 * template dependencies with it -- no schema needed, and a missing import
 * would fail the spec rather than being waved through as a custom element.
 */
describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    // Templates live in separate .html files; resolve them before TestBed
    // reads the component definitions.
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([]), ToolRegistryService, TranslationService],
    });


    await TestBed.compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
