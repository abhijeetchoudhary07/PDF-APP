import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../test-setup';

import { AppComponent } from './app.component';

/*
 * AppComponent is standalone since the app moved to `bootstrapApplication`, so
 * it belongs in `imports` rather than `declarations`.
 */
describe('AppComponent', () => {

  beforeEach(async () => {
    // Templates live in separate .html files; resolve them before TestBed
    // reads the component definitions.
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });


    await TestBed.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
