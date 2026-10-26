plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.aurelien.fusionconseil"
    compileSdk = 34

    defaultConfig {
        applicationId = "fr.aurelien.fusionconseil"
        minSdk = 26
        targetSdk = 34
        // numéro de version = numéro du build GitHub (chaque APK s'installe par-dessus le précédent)
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    // clé de signature fixe (dans le dépôt) : chaque nouvelle version s'installe par-dessus la précédente
    signingConfigs {
        create("fixe") {
            storeFile = file("fusion.keystore")
            storePassword = "fusionconseil"
            keyAlias = "fusion"
            keyPassword = "fusionconseil"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("fixe")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
