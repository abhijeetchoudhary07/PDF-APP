import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../test-setup';

import { FormsModule } from '@angular/forms';
import { RouterModule, provideRouter } from '@angular/router';
import { HomePage } from './home.page';
import { TranslatePipe } from '../shared/components/ui';

/*
 * HomePage is declared by HomePageModule rather than being standalone, so it
 * goes in `declarations`. CUSTOM_ELEMENTS_SCHEMA covers the child components
 * its template uses, which this spec does not exercise.
 */
describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    // Templates live in separate .html files; resolve them before TestBed
    // reads the component definitions.
    await resolveAngularResources();

    TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [FormsModule, RouterModule, TranslatePipe],
      providers: [provideRouter([])],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
