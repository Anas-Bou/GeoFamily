# Family Location App (Nom de Votre Projet)

## 🚩 Table des Matières
* [Description](#-description)
* [Fonctionnalités Clés](#-fonctionnalités-clés)
* [Captures d'Écran](#-captures-décran)
* [Technologies Utilisées](#-technologies-utilisées)
* [Prérequis](#-prérequis)
* [Installation et Lancement](#-installation-et-lancement)
* [Structure du Projet](#-structure-du-projet)
* [Configuration Firebase](#-configuration-firebase)
* [Tests](#-tests)
* [Fonctionnalités Futures (Optionnel)](#-fonctionnalités-futures-optionnel)
* [Auteur(s)](#-auteurs)
* [Licence](#-licence)

## 📜 Description

[Nom de Votre Projet] est une application mobile de localisation familiale conçue pour aider les familles à rester connectées et informées de la position de leurs membres en temps réel. L'application permet également la création de zones géographiques sécurisées (géofences) et l'envoi d'alertes en cas d'urgence (SOS), de batterie faible, ou d'entrée/sortie des zones définies.

Ce projet a été développé dans le cadre de [Nom de votre cours/projet scolaire, ex: projet de fin d'études en Ingénierie Logicielle à l'Université X].

## ✨ Fonctionnalités Clés

*   **Suivi de Localisation en Temps Réel :** Visualisez la position actuelle des membres de la famille sur une carte interactive.
*   **Géofencing :** Créez des zones géographiques personnalisées (ex: maison, école) et recevez des alertes lorsque les membres entrent ou sortent de ces zones.
*   **Alertes SOS :** Permettez aux membres d'envoyer rapidement une alerte d'urgence aux autres membres de la famille.
*   **Alertes de Batterie Faible :** Soyez notifié lorsque le niveau de batterie d'un membre de la famille est faible.
*   **Historique des Trajets :** Consultez l'historique récent des déplacements des membres de la famille.
*   **Gestion de Famille :** Créez des groupes familiaux, invitez des membres, et gérez les rôles (administrateur/membre).
*   **Notifications :** Un centre de notifications pour visualiser toutes les alertes reçues.
*   **Paramètres Personnalisables :** Contrôlez le partage de votre localisation et les préférences de notification.
*   **Authentification Sécurisée :** Inscription et connexion par email/mot de passe.
*   **Thèmes Clair et Sombre :** L'interface s'adapte au thème du système.

## 📸 Captures d'Écran

*(Optionnel mais fortement recommandé. Ajoutez des captures d'écran ici pour illustrer les principales fonctionnalités. Vous pouvez les intégrer directement dans GitHub ou les héberger ailleurs et lier les images.)*

Exemple :
| Login | Carte Principale | Liste Famille |


## 🛠️ Technologies Utilisées

*   **Framework :** React Native avec Expo
*   **Langage :** TypeScript
*   **Navigation :** Expo Router
*   **Base de Données Backend :**
    *   Cloud Firestore (Profils, Familles, Géofences, Notifications, Historique)
    *   Firebase Realtime Database (Localisation en direct, Niveau de batterie)
*   **Authentification :** Firebase Authentication
*   **Cartographie :** `react-native-maps` (utilisant Google Maps sur Android et Apple Maps sur iOS)
*   **APIs Expo :**
    *   `expo-location`
    *   `expo-battery`
    *   `expo-clipboard`
    *   `(Optionnel, si vous réintroduisez) expo-notifications`
*   **Tests :** Jest & React Testing Library
*   **Gestion d'État :** React Context API (`AuthContext`)
*   **Styling :** StyleSheet de React Native, avec prise en charge des thèmes clair/sombre.

## 📋 Prérequis

*   Node.js (version LTS recommandée, ex: 18.x ou 20.x)
*   npm ou Yarn
*   Expo CLI : `npm install -g expo-cli`
*   Un compte Firebase
*   Un appareil mobile (Android/iOS) ou un émulateur/simulateur configuré.
*   (Pour iOS) Xcode sur macOS.
*   (Pour Android) Android Studio et SDK Android.

## 🚀 Installation et Lancement

1.  **Cloner le dépôt :**
    ```bash
    git clone https://github.com/VOTRE_UTILISATEUR/NOM_DE_VOTRE_PROJET.git
    cd NOM_DE_VOTRE_PROJET
    ```

2.  **Installer les dépendances :**
    ```bash
    npm install
    # ou
    yarn install
    ```

3.  **Configurer Firebase :**
    *   Créez un projet Firebase sur [console.firebase.google.com](https://console.firebase.google.com/).
    *   Activez Firebase Authentication (avec la méthode Email/Mot de passe).
    *   Activez Cloud Firestore et Firebase Realtime Database (commencez en mode test pour les règles de sécurité si vous n'avez pas encore configuré les vôtres).
    *   Obtenez vos informations de configuration Firebase :
        *   Pour les applications web/mobiles (utilisées par Expo) : Allez dans "Paramètres du projet" > "Général" > "Vos applications". Si aucune application n'est enregistrée, ajoutez une application Web. Copiez l'objet de configuration.
    *   Remplacez le placeholder `firebaseConfig` dans `src/config/firebaseConfig.ts` par votre propre configuration. **IMPORTANT : Ne commitez jamais vos clés API réelles dans un dépôt public. Utilisez des variables d'environnement pour les déploiements de production.**
    *   Placez vos fichiers `google-services.json` (pour Android) et `GoogleService-Info.plist` (pour iOS) dans le répertoire racine du projet si vous prévoyez de construire des applications natives.

4.  **Lancer l'application avec Expo :**
    ```bash
    npm start
    # ou
    yarn start
    ```
    Cela ouvrira Expo DevTools dans votre navigateur. Vous pourrez ensuite :
    *   Scanner le QR code avec l'application Expo Go sur votre téléphone (Android ou iOS).
    *   Lancer sur un simulateur iOS (pressez `i` dans le terminal).
    *   Lancer sur un émulateur Android (pressez `a` dans le terminal).

## 📁 Structure du Projet

Le projet est structuré en suivant les conventions d'Expo Router et une organisation modulaire :

*   `__tests__/`: Tests unitaires et d'intégration.
*   `app/`: Cœur de l'application, contenant les routes et les écrans (utilisant Expo Router).
    *   `(auth)/`: Écrans d'authentification.
    *   `(tabs)/`: Écrans principaux accessibles via la barre d'onglets.
    *   `geofences/`: Écrans pour la gestion des géofences (utilisant un Stack Layout).
    *   `_layout.tsx`: Fichiers de layout pour Expo Router.
*   `assets/`: Polices, images.
*   `components/`: Composants React réutilisables.
*   `config/`: Configuration de Firebase.
*   `constants/`: Constantes (ex: `Colors.ts`).
*   `context/`: Contextes React (ex: `AuthContext.ts`).
*   `hooks/`: Hooks React personnalisés.
*   `types/`: Définitions de types TypeScript globales (ex: `navigation.ts`).
*   `utils/`: Fonctions utilitaires.

## 🔥 Configuration Firebase

1.  **Authentification :** La méthode Email/Mot de passe doit être activée.
2.  **Cloud Firestore :**
    *   Créez les collections suivantes (initialement vides si nécessaire) :
        *   `users`
        *   `families`
        *   `geofences`
        *   `notifications`
        *   `locationHistory` (si utilisée)
    *   Déployez les règles de sécurité Firestore (`firestore.rules`) fournies ou adaptées à vos besoins.
3.  **Realtime Database :**
    *   Assurez-vous que la base de données est créée.
    *   Déployez les règles de sécurité RTDB (`database.rules.json`) pour contrôler l'accès à `/liveData`.
4.  **(Si vous décidez d'utiliser les Cloud Functions plus tard)**
    *   Assurez-vous que votre projet est sur le plan Blaze.
    *   Déployez les fonctions : `firebase deploy --only functions`.

## 🧪 Tests

Pour lancer les tests unitaires :
```bash
npm test
# ou
yarn test
